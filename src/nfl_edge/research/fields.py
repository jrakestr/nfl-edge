"""Research Lab player fields for (season S, week W), as-of: season = S and week < W only.

One row per active skill player. Fields are the inputs the Lab's user-defined metrics weight:
  usage priors (priors/usage.py, shrunk, recency-weighted, past 3 seasons + this one):
    target_share carry_share rz_target_share rz_carry_share snap_pct
  this season's games before week W (unshrunk, no imputation):
    games_played, targets_l3, receptions_l3, rec_yds_l3, carries_l3, rush_yds_l3,
    dk_pts_l3, dk_pts_season, snap_pct_l3, snap_pct_last
`_l3` = mean over the player's last three games this season (fewer if he has fewer). A field is
null when the player has no row to compute it from; nothing is filled or substituted.

DFS context fields (price, sim, matchup, game environment, opportunity, ownership, point variance)
come from research/context.py. They are all-or-null per source: a week with no sim run, no salary
slate, no ownership CSV or no overrides has those fields null for everyone.

Fail closed: no usage priors, no games this season, or any input row at or after (S, W) raises
ResearchDataMissing and nothing is written.
"""
from __future__ import annotations

import polars as pl

from ..config import load_yaml
from ..db import read_sql, replace_scope
from ..sim.scoring import score_offense

USAGE_FIELDS = ["target_share", "carry_share", "rz_target_share", "rz_carry_share", "snap_pct"]
FORM_FIELDS = [
    "games_played", "targets_l3", "receptions_l3", "rec_yds_l3", "carries_l3", "rush_yds_l3",
    "dk_pts_l3", "dk_pts_season", "snap_pct_l3", "snap_pct_last",
]
FIELD_NAMES = [*USAGE_FIELDS, *FORM_FIELDS]
TABLE = "model.research_fields"
L3 = 3


class ResearchDataMissing(RuntimeError):
    """Required as-of data is absent or violates the as-of rule. Nothing was written."""


def load_stats(season: int, week: int) -> pl.DataFrame:
    return read_sql(
        """
        select season, week, player_id, team, position, opponent_team,
               coalesce((stats->>'targets')::float, 0) as targets,
               coalesce((stats->>'receptions')::float, 0) as receptions,
               coalesce((stats->>'receiving_yards')::float, 0) as rec_yds,
               coalesce((stats->>'carries')::float, 0) as carries,
               coalesce((stats->>'rushing_yards')::float, 0) as rush_yds,
               coalesce((stats->>'receiving_tds')::float, 0) as rec_td,
               coalesce((stats->>'rushing_tds')::float, 0) as rush_td,
               coalesce((stats->>'passing_yards')::float, 0) as pass_yds,
               coalesce((stats->>'passing_tds')::float, 0) as pass_td,
               coalesce((stats->>'passing_interceptions')::float, 0) as int_,
               coalesce((stats->>'rushing_fumbles_lost')::float, 0)
                 + coalesce((stats->>'receiving_fumbles_lost')::float, 0)
                 + coalesce((stats->>'sack_fumbles_lost')::float, 0) as fum_lost,
               coalesce((stats->>'passing_2pt_conversions')::float, 0)
                 + coalesce((stats->>'rushing_2pt_conversions')::float, 0)
                 + coalesce((stats->>'receiving_2pt_conversions')::float, 0) as two_pt
        from raw.player_stats_weekly
        where season = %s and week < %s
        """,
        (season, week),
    )


def load_snaps(season: int, week: int) -> pl.DataFrame:
    return read_sql(
        """
        select s.season, s.week, p.gsis_id as player_id, s.offense_pct::float8 as offense_pct
        from raw.snap_counts s join raw.players p on p.pfr_id = s.pfr_player_id
        where s.season = %s and s.week < %s and s.offense_pct is not null
        """,
        (season, week),
    )


def _assert_as_of(df: pl.DataFrame, season: int, week: int, name: str) -> None:
    """The as-of rule, checked on the data itself: no row at or after (season, week)."""
    if df.is_empty():
        return
    bad = df.filter((pl.col("season") > season) | ((pl.col("season") == season) & (pl.col("week") >= week)))
    if not bad.is_empty():
        raise ResearchDataMissing(
            f"{name} has {bad.height} rows at or after season {season} week {week}; refusing to build"
        )


def with_dk(stats: pl.DataFrame, rules: dict) -> pl.DataFrame:
    """Stats for this season only, plus dk_pts, sorted by player and week."""
    dk = score_offense(
        {"pass_yds": stats["pass_yds"], "pass_td": stats["pass_td"], "int": stats["int_"],
         "rush_yds": stats["rush_yds"], "rush_td": stats["rush_td"], "rec": stats["receptions"],
         "rec_yds": stats["rec_yds"], "rec_td": stats["rec_td"], "fum_lost": stats["fum_lost"],
         "two_pt": stats["two_pt"]},
        rules,
    )["dk"]
    return stats.with_columns(pl.Series("dk_pts", dk, dtype=pl.Float64)).sort(["player_id", "week"])


def check_inputs(stats: pl.DataFrame, snaps: pl.DataFrame, usage: pl.DataFrame, season: int, week: int) -> pl.DataFrame:
    """As-of and presence checks; returns this season's stats."""
    _assert_as_of(stats, season, week, "player stats")
    _assert_as_of(snaps, season, week, "snap counts")
    if usage.is_empty():
        raise ResearchDataMissing(f"no usage priors for season {season} week {week}")
    stats = stats.filter(pl.col("season") == season)
    if stats.is_empty():
        raise ResearchDataMissing(
            f"no player stats for season {season} before week {week}; form fields need at least one game"
        )
    return stats


def build_core(stats_dk: pl.DataFrame, snaps: pl.DataFrame, usage: pl.DataFrame, season: int) -> pl.DataFrame:
    """Pure. Wide frame: player_id, full_name, team, position + FIELD_NAMES (floats, nulls kept)."""
    form = stats_dk.group_by("player_id", maintain_order=True).agg(
        pl.len().cast(pl.Float64).alias("games_played"),
        pl.col("targets").tail(L3).mean().alias("targets_l3"),
        pl.col("receptions").tail(L3).mean().alias("receptions_l3"),
        pl.col("rec_yds").tail(L3).mean().alias("rec_yds_l3"),
        pl.col("carries").tail(L3).mean().alias("carries_l3"),
        pl.col("rush_yds").tail(L3).mean().alias("rush_yds_l3"),
        pl.col("dk_pts").tail(L3).mean().alias("dk_pts_l3"),
        pl.col("dk_pts").mean().alias("dk_pts_season"),
    )
    snap_form = (
        snaps.filter(pl.col("season") == season).sort(["player_id", "week"])
        .group_by("player_id", maintain_order=True)
        .agg(
            pl.col("offense_pct").tail(L3).mean().alias("snap_pct_l3"),
            pl.col("offense_pct").last().alias("snap_pct_last"),
        )
    )
    out = (
        usage.select("player_id", "full_name", "team", "position", *USAGE_FIELDS)
        .join(form, on="player_id", how="left")
        .join(snap_form, on="player_id", how="left")
    )
    return out.with_columns([pl.col(f).cast(pl.Float64).fill_nan(None).alias(f) for f in FIELD_NAMES])


def pack(df: pl.DataFrame, names: list[str], season: int, week: int) -> pl.DataFrame:
    """Wide frame -> table shape: season, week, ids, opponent, game_id, `fields` struct."""
    for extra in ("opponent", "game_id"):
        if extra not in df.columns:
            df = df.with_columns(pl.lit(None, dtype=pl.Utf8).alias(extra))
    df = df.with_columns([pl.col(n).cast(pl.Float64).fill_nan(None).alias(n) for n in names])
    return df.select(
        pl.lit(season).alias("season"),
        pl.lit(week).alias("week"),
        "player_id", "full_name", "team", "position", "opponent", "game_id",
        pl.struct(names).alias("fields"),
    ).sort(["team", "position", "player_id"])


def build_fields(stats: pl.DataFrame, snaps: pl.DataFrame, usage: pl.DataFrame, season: int,
                 week: int, rules: dict) -> pl.DataFrame:
    """Pure. Core (usage + form) fields only. Columns: season, week, player_id, full_name, team,
    position, opponent, game_id, fields (struct of FIELD_NAMES)."""
    stats = check_inputs(stats, snaps, usage, season, week)
    return pack(build_core(with_dk(stats, rules), snaps, usage, season), FIELD_NAMES, season, week)


def run(season: int, week: int) -> int:
    """Build and replace research_fields for (season, week). Returns rows written."""
    from ..priors import common
    from ..priors import usage as U
    from . import context as X

    rules = load_yaml("scoring.yaml")
    c = common.cfg()
    pw, roster = U.load_player_weeks(season, week), U.load_roster(season, week)
    overrides = U.load_overrides(season, week)
    usage = U.build(pw, roster, season, week, c, overrides=overrides)
    base_usage = U.build(pw, roster, season, week, c, overrides=None)  # shares before out/doubtful overrides

    stats_all, snaps = load_stats(season, week), load_snaps(season, week)
    stats = check_inputs(stats_all, snaps, usage, season, week)
    stats_dk = with_dk(stats, rules)
    core = build_core(stats_dk, snaps, usage, season)

    games = X.load_games(season, week)
    game_runs = X.load_game_runs(season, week)
    team_inputs = X.load_team_inputs(game_runs, games)

    wide = core.join(games.select("team", "opponent", "game_id", "kickoff"), on="team", how="left")
    wide = X.salary_fields(wide, X.load_salary_rows(season, week))
    wide = wide.join(X.load_sim(game_runs, wide.select("player_id", "dk_salary")), on="player_id", how="left")
    wide = wide.join(X.dk_variance(stats_dk, season, week), on="player_id", how="left")

    opp = X.opp_vs_position(stats_dk, season, week).rename({"defense": "opponent"})
    wide = wide.join(opp, on=["opponent", "position"], how="left")
    if team_inputs.is_empty():
        wide = wide.with_columns(pl.lit(None, dtype=pl.Float64).alias("opp_def_ppd_allowed"),
                                 pl.lit(None, dtype=pl.Float64).alias("opp_def_ppd_vs_league"))
    else:
        d = team_inputs.select(
            pl.col("team").alias("opponent"), pl.col("def_ppd").alias("opp_def_ppd_allowed"),
            (pl.col("def_ppd") / pl.col("league_def_ppd") - 1.0).alias("opp_def_ppd_vs_league"))
        wide = wide.join(d, on="opponent", how="left")

    env = X.environment_fields(games, X.load_lines(season, week), team_inputs)
    wide = wide.join(env, on="team", how="left")

    tm = X.teammates_out(base_usage, overrides).select(
        "player_id", "teammates_out_target_share", "teammates_out_carry_share")
    if tm.is_empty():
        tm = wide.select("player_id").with_columns(
            pl.lit(None, dtype=pl.Float64).alias("teammates_out_target_share"),
            pl.lit(None, dtype=pl.Float64).alias("teammates_out_carry_share"))
    wide = wide.join(tm, on="player_id", how="left").join(X.status_flags(wide, overrides), on="player_id", how="left")
    wide = wide.join(X.ownership_fields(wide, X.load_ownership(season, week)), on="player_id", how="left")

    df = pack(wide, [*FIELD_NAMES, *X.CONTEXT_FIELDS], season, week)
    return replace_scope(df, TABLE, "season = %s and week = %s", (season, week))
