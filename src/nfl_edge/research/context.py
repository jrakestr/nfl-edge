"""Research Lab DFS context fields for (season S, week W): price, sim, matchup, environment,
opportunity, ownership, history. Everything here is as-of safe:

  history (matchup table, point variance): rows with season = S and week < W only.
  pregame inputs for week W (salary, market lines, overrides, ownership CSV, sim run): published
    before kickoff. Salary rows, market snapshots and sim runs are cut off at the kickoff of the
    player's own game, so a Sunday player never reads a number created after his game started.

Fail closed, per source: when a source is absent for the week (no sim run, no salary slate, no
ownership CSV, no overrides) its fields are null for every player. Nothing is imputed, estimated
or borrowed from another source, and the web page shows the dependent question as "needs data".
"""
from __future__ import annotations

import csv
import re
from pathlib import Path

import polars as pl

from ..config import ROOT
from ..db import read_sql

SALARY_FIELDS = ["dk_salary", "salary_pos_rank"]
SIM_FIELDS = [
    "sim_dk_mean", "sim_dk_sd", "sim_dk_p10", "sim_dk_p50", "sim_dk_p90", "sim_p_3x", "sim_p_5x",
    "sim_value_x",
]
MATCHUP_FIELDS = [
    "opp_dk_allowed_pos", "opp_dk_allowed_pos_vs_league", "opp_dk_allowed_pos_rank", "opp_games",
    "opp_def_ppd_allowed", "opp_def_ppd_vs_league",
]
ENV_FIELDS = [
    "team_spread", "game_total", "team_implied_total", "sim_team_drives", "sim_team_plays_per_drive",
    "sim_team_neutral_pass_rate",
]
OPPORTUNITY_FIELDS = [
    "teammates_out_target_share", "teammates_out_carry_share", "listed_out", "listed_doubtful",
    "listed_questionable",
]
OWNERSHIP_FIELDS = ["own_pct_est", "own_pct_low", "own_pct_high"]
HISTORY_FIELDS = ["dk_pts_sd", "dk_pts_min"]
CONTEXT_FIELDS = [
    *SALARY_FIELDS, *SIM_FIELDS, *MATCHUP_FIELDS, *ENV_FIELDS, *OPPORTUNITY_FIELDS, *OWNERSHIP_FIELDS,
    *HISTORY_FIELDS,
]

SKILL_POS = ["QB", "RB", "WR", "TE"]
POS_MAP = {"FB": "RB", "HB": "RB"}
OWNERSHIP_DIR = ROOT / "data" / "benchmarks"
# FantasyPros team codes that differ from ours.
TEAM_ALIASES = {"JAC": "JAX", "LAR": "LA", "WSH": "WAS", "ARZ": "ARI", "BLT": "BAL", "CLV": "CLE", "HST": "HOU"}


def _null_floats(names: list[str]) -> list[pl.Expr]:
    return [pl.lit(None, dtype=pl.Float64).alias(n) for n in names]


# ---------- price ----------

KO = "(s.gameday + s.gametime::time) at time zone 'America/New_York'"


def load_salary_rows(season: int, week: int) -> pl.DataFrame:
    """player_id, dk_salary, ingested_at: every classic-slate salary row for the week."""
    schema = {"player_id": pl.Utf8, "dk_salary": pl.Float64}
    df = read_sql(
        "select player_id, salary::float8 as dk_salary, ingested_at from raw.dk_salaries "
        "where slate_id like %s and slate_id not like %s and player_id is not null and salary is not null",
        (f"{season}_{week:02d}_%", "%showdown"),
    )
    return df if df.height else pl.DataFrame(schema={**schema, "ingested_at": pl.Datetime("us", "UTC")})


def salary_fields(players: pl.DataFrame, rows: pl.DataFrame) -> pl.DataFrame:
    """Adds dk_salary and salary_pos_rank (1 = highest salary at his position, ties share a rank).

    `players` carries `kickoff` (his game). Only rows ingested before it count; the newest wins
    (ties: higher salary). No row before kickoff -> null.
    """
    if rows.is_empty():
        best = pl.DataFrame(schema={"player_id": pl.Utf8, "dk_salary": pl.Float64})
    else:
        j = players.select("player_id", "kickoff").join(rows, on="player_id", how="inner").filter(
            pl.col("ingested_at") < pl.col("kickoff"))
        best = j.sort(["ingested_at", "dk_salary"], descending=True).unique(
            subset="player_id", keep="first", maintain_order=True).select("player_id", "dk_salary")
    out = players.join(best, on="player_id", how="left")
    return out.with_columns(
        pl.col("dk_salary").rank(method="min", descending=True).over("position").cast(pl.Float64)
        .alias("salary_pos_rank")
    )


# ---------- sim ----------

def load_game_runs(season: int, week: int) -> pl.DataFrame:
    """game_id, run_id: per game, the newest sim run created before that game's kickoff."""
    df = read_sql(
        f"select distinct on (p.game_id) p.game_id, r.run_id::text as run_id "
        f"from model.proj_players p join model.sim_runs r using (run_id) "
        f"join raw.schedules s on s.game_id = p.game_id "
        f"where r.season = %s and r.week = %s and s.gametime is not null and r.created_at < {KO} "
        f"order by p.game_id, r.created_at desc",
        (season, week),
    )
    return df if df.height else pl.DataFrame(schema={"game_id": pl.Utf8, "run_id": pl.Utf8})


def draw_quantiles(draws: pl.DataFrame, salaries: pl.DataFrame) -> pl.DataFrame:
    """Pure. draws: player_id, fpts_dk (one row per draw). Quantiles and P(DK >= k x salary/1000)."""
    sal = salaries.select("player_id", (pl.col("dk_salary") / 1000.0).alias("_k"))
    d = draws.select("player_id", "fpts_dk").join(sal, on="player_id", how="left")
    return d.group_by("player_id").agg(
        pl.col("fpts_dk").quantile(0.1, interpolation="linear").alias("sim_dk_p10"),
        pl.col("fpts_dk").quantile(0.5, interpolation="linear").alias("sim_dk_p50"),
        pl.col("fpts_dk").quantile(0.9, interpolation="linear").alias("sim_dk_p90"),
        (pl.col("fpts_dk") >= 3.0 * pl.col("_k")).mean().alias("sim_p_3x"),
        (pl.col("fpts_dk") >= 5.0 * pl.col("_k")).mean().alias("sim_p_5x"),
    ).with_columns(pl.col("sim_dk_p10", "sim_dk_p50", "sim_dk_p90").cast(pl.Float64))


def load_sim(game_runs: pl.DataFrame, salaries: pl.DataFrame) -> pl.DataFrame:
    """Per-player sim fields from each game's run: mean/sd from proj_players, quantiles from the draws files.

    `salaries`: player_id, dk_salary. Quantile fields stay null for a game whose draws file is gone
    (draws are pruned after grading).
    """
    cols = ["player_id", *SIM_FIELDS]
    empty = pl.DataFrame(schema={c: (pl.Utf8 if c == "player_id" else pl.Float64) for c in cols})
    if game_runs.is_empty():
        return empty
    proj = read_sql(
        "select p.player_id, p.fpts_dk_mean::float8 as sim_dk_mean, p.fpts_dk_sd::float8 as sim_dk_sd, p.draws_path "
        "from model.proj_players p where p.position not in ('DST', 'K') and (p.run_id::text, p.game_id) in "
        "(select run_id, game_id from unnest(%s::text[], %s::text[]) as t(run_id, game_id))",
        (game_runs["run_id"].to_list(), game_runs["game_id"].to_list()),
    )
    if proj.is_empty():
        return empty
    frames = []
    for path in {p for p in proj["draws_path"].to_list() if p}:
        f = ROOT / path
        if f.exists():
            frames.append(pl.read_parquet(f, columns=["player_id", "fpts_dk"]))
    if frames:
        q = draw_quantiles(pl.concat(frames), salaries)
    else:
        q = pl.DataFrame(schema={"player_id": pl.Utf8, **{c: pl.Float64 for c in
                                 ["sim_dk_p10", "sim_dk_p50", "sim_dk_p90", "sim_p_3x", "sim_p_5x"]}})
    out = proj.drop("draws_path").join(q, on="player_id", how="left")
    out = out.join(salaries, on="player_id", how="left").with_columns(
        pl.when(pl.col("dk_salary") > 0).then(pl.col("sim_dk_mean") / (pl.col("dk_salary") / 1000.0))
        .otherwise(None).alias("sim_value_x")
    ).drop("dk_salary")
    return out.select(cols)


def load_team_inputs(game_runs: pl.DataFrame, games: pl.DataFrame) -> pl.DataFrame:
    """Per team, from the run chosen for his game."""
    empty = pl.DataFrame(schema={"team": pl.Utf8})
    if game_runs.is_empty() or games.is_empty():
        return empty
    pairs = games.select("team", "game_id").join(game_runs, on="game_id", how="inner")
    if pairs.is_empty():
        return empty
    return read_sql(
        "select t.team, t.drives_mean::float8 as sim_team_drives, "
        "t.plays_per_drive::float8 as sim_team_plays_per_drive, "
        "t.neutral_pass_rate::float8 as sim_team_neutral_pass_rate, t.def_ppd_allowed::float8 as def_ppd, "
        "t.league_def_ppd_allowed::float8 as league_def_ppd from model.run_team_inputs t "
        "where (t.run_id::text, t.team) in (select run_id, team from unnest(%s::text[], %s::text[]) as x(run_id, team))",
        (pairs["run_id"].to_list(), pairs["team"].to_list()),
    )


# ---------- schedule, lines ----------

def load_games(season: int, week: int) -> pl.DataFrame:
    """team, opponent, game_id, home (1/0), kickoff: one row per team in the week's schedule."""
    sched = read_sql(
        f"select game_id, home_team, away_team, {KO} as kickoff from raw.schedules s "
        f"where season = %s and week = %s",
        (season, week),
    )
    if sched.is_empty():
        return pl.DataFrame(schema={"team": pl.Utf8, "opponent": pl.Utf8, "game_id": pl.Utf8,
                                    "home": pl.Int64, "kickoff": pl.Datetime("us", "UTC")})
    home = sched.select(pl.col("home_team").alias("team"), pl.col("away_team").alias("opponent"), "game_id",
                        pl.lit(1).alias("home"), "kickoff")
    away = sched.select(pl.col("away_team").alias("team"), pl.col("home_team").alias("opponent"), "game_id",
                        pl.lit(0).alias("home"), "kickoff")
    return pl.concat([home, away])


def load_lines(season: int, week: int) -> pl.DataFrame:
    """game_id, home_fav (positive = home favored), total: newest market snapshot before that game's kickoff."""
    return read_sql(
        "select distinct on (m.game_id) m.game_id, m.spread_line::float8 as home_fav, m.total_line::float8 as total "
        "from raw.market_lines m join raw.schedules s on s.game_id = m.game_id "
        "where s.season = %s and s.week = %s and s.gametime is not null "
        "and m.spread_line is not null and m.total_line is not null "
        "and m.captured_at < (s.gameday + s.gametime::time) at time zone 'America/New_York' "
        "order by m.game_id, m.captured_at desc",
        (season, week),
    )


def environment_fields(games: pl.DataFrame, lines: pl.DataFrame, team_inputs: pl.DataFrame) -> pl.DataFrame:
    """Per team: team_spread (negative = favorite), game_total, team_implied_total, sim pace inputs."""
    cols = ["team", "team_spread", "game_total", "team_implied_total"]
    if games.is_empty() or lines.is_empty():
        base = games.select("team").with_columns(*_null_floats(cols[1:])) if not games.is_empty() else \
            pl.DataFrame(schema={"team": pl.Utf8, **{c: pl.Float64 for c in cols[1:]}})
    else:
        base = games.join(lines, on="game_id", how="inner").with_columns(
            pl.when(pl.col("home") == 1).then(-pl.col("home_fav")).otherwise(pl.col("home_fav"))
            .alias("team_spread"),
            pl.col("total").alias("game_total"),
        ).with_columns(
            (pl.col("game_total") / 2.0 - pl.col("team_spread") / 2.0).alias("team_implied_total")
        ).select(cols)
    pace = ["sim_team_drives", "sim_team_plays_per_drive", "sim_team_neutral_pass_rate"]
    if team_inputs.is_empty():
        return base.with_columns(*_null_floats(pace))
    return base.join(team_inputs.select("team", *pace), on="team", how="left")


# ---------- matchup ----------

def opp_vs_position(stats_dk: pl.DataFrame, season: int, week: int) -> pl.DataFrame:
    """Pure. stats_dk: season, week, position, opponent_team, dk_pts. As-of: season rows before `week`.

    Per defense and position: mean over its games of the DK points that position scored against it,
    relative to the league mean, and its rank (1 = most generous).
    """
    schema = {"defense": pl.Utf8, "position": pl.Utf8, "opp_dk_allowed_pos": pl.Float64,
              "opp_dk_allowed_pos_vs_league": pl.Float64, "opp_dk_allowed_pos_rank": pl.Float64,
              "opp_games": pl.Float64}
    d = stats_dk.filter((pl.col("season") == season) & (pl.col("week") < week)
                        & pl.col("opponent_team").is_not_null())
    if d.is_empty():
        return pl.DataFrame(schema=schema)
    d = d.with_columns(pl.col("position").replace(POS_MAP)).filter(pl.col("position").is_in(SKILL_POS))
    per_game = d.group_by(["opponent_team", "week", "position"]).agg(pl.col("dk_pts").sum().alias("pts"))
    per_def = per_game.group_by(["opponent_team", "position"]).agg(
        pl.col("pts").mean().alias("opp_dk_allowed_pos"), pl.len().cast(pl.Float64).alias("opp_games")
    )
    return per_def.with_columns(
        (pl.col("opp_dk_allowed_pos") / pl.col("opp_dk_allowed_pos").mean().over("position") - 1.0)
        .alias("opp_dk_allowed_pos_vs_league"),
        pl.col("opp_dk_allowed_pos").rank(method="min", descending=True).over("position").cast(pl.Float64)
        .alias("opp_dk_allowed_pos_rank"),
    ).rename({"opponent_team": "defense"}).select(list(schema))


# ---------- opportunity ----------

def teammates_out(base_usage: pl.DataFrame, overrides: pl.DataFrame) -> pl.DataFrame:
    """Pure. Per team: target/carry share vacated by teammates listed out or doubtful (pre-override shares).

    Returns team, teammates_out_target_share, teammates_out_carry_share. Empty overrides -> empty frame
    (the caller leaves the fields null: no injury data is not the same as nobody listed).
    """
    schema = {"team": pl.Utf8, "player_id": pl.Utf8, "teammates_out_target_share": pl.Float64,
              "teammates_out_carry_share": pl.Float64}
    if overrides.is_empty():
        return pl.DataFrame(schema=schema)
    gone = base_usage.join(
        overrides.filter(pl.col("status").is_in(["out", "doubtful"])).select("player_id"),
        on="player_id", how="inner",
    )
    team_tot = gone.group_by("team").agg(
        pl.col("target_share").sum().alias("_t"), pl.col("carry_share").sum().alias("_c")
    )
    own = gone.select("team", "player_id", pl.col("target_share").alias("_ot"), pl.col("carry_share").alias("_oc"))
    allp = base_usage.select("team", "player_id").join(team_tot, on="team", how="left") \
        .join(own, on=["team", "player_id"], how="left")
    return allp.select(
        "team", "player_id",
        (pl.col("_t").fill_null(0.0) - pl.col("_ot").fill_null(0.0)).alias("teammates_out_target_share"),
        (pl.col("_c").fill_null(0.0) - pl.col("_oc").fill_null(0.0)).alias("teammates_out_carry_share"),
    )


def status_flags(players: pl.DataFrame, overrides: pl.DataFrame) -> pl.DataFrame:
    """listed_out / listed_doubtful / listed_questionable as 1.0/0.0; null for all when no overrides exist."""
    names = ["listed_out", "listed_doubtful", "listed_questionable"]
    if overrides.is_empty():
        return players.select("player_id").with_columns(*_null_floats(names))
    st = overrides.select("player_id", "status")
    return players.select("player_id").join(st, on="player_id", how="left").with_columns(
        (pl.col("status") == "out").fill_null(False).cast(pl.Float64).alias("listed_out"),
        (pl.col("status") == "doubtful").fill_null(False).cast(pl.Float64).alias("listed_doubtful"),
        (pl.col("status") == "questionable").fill_null(False).cast(pl.Float64).alias("listed_questionable"),
    ).select("player_id", *names)


# ---------- ownership ----------

_SUFFIX = re.compile(r"\b(jr|sr|ii|iii|iv|v)\b")


def norm_name(name: str) -> str:
    s = re.sub(r"[^a-z ]", "", name.lower().replace("-", " "))
    return re.sub(r"\s+", " ", _SUFFIX.sub("", s)).strip()


def bucket_bounds(bucket: str) -> tuple[float, float] | None:
    """'20-30%' -> (20.0, 30.0). Anything else -> None (never a guessed value)."""
    m = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*%\s*", bucket or "")
    if not m:
        return None
    lo, hi = float(m.group(1)), float(m.group(2))
    return (lo, hi) if hi >= lo else None


def ownership_path(season: int, week: int) -> Path:
    return OWNERSHIP_DIR / f"fantasypros_dfs_{season}_week{week:02d}.csv"


def load_ownership(season: int, week: int) -> pl.DataFrame:
    """norm_name, team, position, own_pct_est/low/high from the FantasyPros roster-% CSV; empty when absent."""
    schema = {"_name": pl.Utf8, "_team": pl.Utf8, "_pos": pl.Utf8, "own_pct_est": pl.Float64,
              "own_pct_low": pl.Float64, "own_pct_high": pl.Float64}
    path = ownership_path(season, week)
    if not path.exists():
        return pl.DataFrame(schema=schema)
    rows = []
    with path.open(newline="") as fh:
        for r in csv.DictReader(fh):
            b = bucket_bounds(r.get("roster_bucket", ""))
            if b is None:
                continue
            team = (r.get("team") or "").strip().upper()
            rows.append({"_name": norm_name(r.get("name", "")), "_team": TEAM_ALIASES.get(team, team),
                         "_pos": (r.get("pos") or "").strip().upper(), "own_pct_est": (b[0] + b[1]) / 2.0,
                         "own_pct_low": b[0], "own_pct_high": b[1]})
    return pl.DataFrame(rows, schema=schema) if rows else pl.DataFrame(schema=schema)


def ownership_fields(players: pl.DataFrame, own: pl.DataFrame) -> pl.DataFrame:
    """Join on normalized name + team + position. Unmatched or ambiguous players stay null."""
    names = OWNERSHIP_FIELDS
    if own.is_empty():
        return players.select("player_id").with_columns(*_null_floats(names))
    own = own.unique(subset=["_name", "_team", "_pos"], keep="none")  # ambiguous rows match nobody
    p = players.select("player_id", pl.col("full_name").map_elements(norm_name, return_dtype=pl.Utf8).alias("_name"),
                       pl.col("team").alias("_team"), pl.col("position").alias("_pos"))
    return p.join(own, on=["_name", "_team", "_pos"], how="left").select("player_id", *names)


# ---------- history variance ----------

def dk_variance(stats_dk: pl.DataFrame, season: int, week: int) -> pl.DataFrame:
    """Pure. Per player, this season before `week`: population sd and min of weekly DK points (>= 2 games)."""
    d = stats_dk.filter((pl.col("season") == season) & (pl.col("week") < week))
    if d.is_empty():
        return pl.DataFrame(schema={"player_id": pl.Utf8, "dk_pts_sd": pl.Float64, "dk_pts_min": pl.Float64})
    return d.group_by("player_id").agg(
        pl.when(pl.len() >= 2).then(pl.col("dk_pts").std(ddof=0)).otherwise(None).alias("dk_pts_sd"),
        pl.when(pl.len() >= 2).then(pl.col("dk_pts").min()).otherwise(None).alias("dk_pts_min"),
    ).with_columns(pl.col("dk_pts_sd", "dk_pts_min").cast(pl.Float64))
