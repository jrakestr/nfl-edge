"""Phase 1 lookback before/after: Lamb, Watson, 32 QB factors, board pts_gap.

Reconstructs the old one-season window + flat prior-season weight + unweighted /
sum(w) n_eff + old shrink_k without reverting commits. After numbers use current
builders. Local sim only — do not publish over the live 2026 week-1 run.
"""
from __future__ import annotations

import polars as pl

from .. import priors as pr
from ..priors import common, qb, team, usage
from .shrink_sweep import CHANGED_QB_TEAMS

SEASON, WEEK = 2026, 1
BEFORE_PTS_GAP = 0.88  # f049d136, 20k draws
BEFORE_RUN = "f049d136"
OLD_K = {
    "shrink_k_usage": 3,
    "shrink_k_targets": 40,
    "shrink_k_carries": 60,
    "shrink_k_qb_att": 150,
    "shrink_k_team": 4,
    "shrink_k_qb_share": 3,
}
LOOKBACK_WEEKS = 8
PRIOR_SEASON_WEIGHT = 0.35
REPORT_NAMES = ("CeeDee Lamb", "Deshaun Watson")


def old_window_mask(season: int, week: int) -> pl.Expr:
    return (
        ((pl.col("season") == season - 1) & (pl.col("week") != 18))
        | ((pl.col("season") == season) & (pl.col("week") < week))
    )


def legacy_weights(df: pl.DataFrame, season: int, week: int) -> pl.DataFrame:
    """Pre-lookback weights: exp(-(W-week)/8) in-season, 0.35 on the prior season."""
    g = df.filter(~((pl.col("season") == season - 1) & (pl.col("week") == 18)))
    return g.with_columns(
        pl.when(pl.col("season") == season)
        .then(((pl.col("week") - week).cast(pl.Float64) / LOOKBACK_WEEKS).exp())
        .otherwise(pl.lit(PRIOR_SEASON_WEIGHT))
        .alias("w")
    )


def mean_pts_gap(games: pl.DataFrame) -> float:
    """Board-wide mean of team (mean_pts − market implied). Same split as explain.ts."""
    g = games.filter(
        pl.col("mean_total").is_not_null() & pl.col("mean_spread").is_not_null()
        & pl.col("market_total").is_not_null() & pl.col("market_spread").is_not_null()
    )
    home = (g["mean_total"] + g["mean_spread"]) / 2 - (g["market_total"] + g["market_spread"]) / 2
    away = (g["mean_total"] - g["mean_spread"]) / 2 - (g["market_total"] - g["market_spread"]) / 2
    return float(pl.concat([home, away]).mean())


def incumbent_kish_vs_raw(h: float) -> tuple[float, float]:
    """51 prior-season games (S-3..S-1, weeks 1–17) at half-life H. Matches the unit fixture."""
    rows = [{"season": season, "week": w} for season in (2023, 2024, 2025) for w in range(1, 18)]
    g = common.with_weights(pl.DataFrame(rows), 2026, 1, {"recency_half_life_weeks": h})
    w = g["w"]
    return float(g.height), float((w.sum() ** 2) / (w ** 2).sum())


def resolve_players(names: tuple[str, ...] = REPORT_NAMES) -> dict[str, str]:
    """display_name → gsis_id from raw.players. Fail closed if a name is missing or duplicated."""
    from ..db import read_sql

    rows = read_sql(
        "select gsis_id, display_name from raw.players where display_name = any(%s)",
        (list(names),),
    )
    found = rows.group_by("display_name").agg(pl.col("gsis_id").unique())
    out: dict[str, str] = {}
    for name in names:
        hit = found.filter(pl.col("display_name") == name)
        if hit.height != 1 or hit["gsis_id"][0].len() != 1:
            raise RuntimeError(f"could not uniquely resolve {name!r} in raw.players")
        out[name] = hit["gsis_id"][0][0]
    return out


def _legacy_qb(qw: pl.DataFrame, starters: pl.DataFrame, fallback: pl.DataFrame,
               season: int, week: int, c: dict) -> pl.DataFrame:
    """Old qb.build: one-season window, sum(w) team n_eff, n_att shrink, fill-to-league factor."""
    g = legacy_weights(qw.filter(old_window_mask(season, week)), season, week)
    league_ypa = float(g.select(common.league_ratio("pass_yds", "attempts")).item()) if g.height else 7.0
    lo, hi = c.get("qb_factor_clip", [0.8, 1.2])
    team_weeks = g.unique(subset=["season", "week", "team"])
    tm = team_weeks.group_by("team").agg(
        pl.col("w").sum().alias("n_eff"),
        common.weighted_ratio("team_pass_yds", "team_attempts").alias("_ypa"),
    ).with_columns(
        common.shrink(pl.col("_ypa"), pl.col("n_eff"), league_ypa, float(c["shrink_k_team"])).alias("team_ypa")
    ).select(["team", "team_ypa"])
    per_qb = g.with_columns((pl.col("attempts") / pl.col("team_attempts")).alias("_share")).group_by("player_id").agg(
        pl.col("attempts").sum().alias("n_att"),
        (pl.col("attempts") >= 10).sum().alias("n_starts"),
        common.weighted_ratio("pass_yds", "attempts").alias("_ypa"),
        ((pl.col("w") * pl.col("_share")).filter(pl.col("attempts") >= 10).sum()
         / pl.col("w").filter(pl.col("attempts") >= 10).sum()).alias("_share"),
    ).with_columns(
        common.shrink(pl.col("_ypa"), pl.col("n_att"), league_ypa, float(c["shrink_k_qb_att"])).alias("qb_ypa"),
        common.shrink(pl.col("_share"), pl.col("n_starts"), float(c["qb_att_share_prior"]),
                      float(c["shrink_k_qb_share"])).alias("qb_att_share"),
    ).select(["player_id", "qb_ypa", "qb_att_share", "n_att"])
    lookback = (
        g.group_by(["team", "player_id"]).agg(pl.col("attempts").sum().alias("qb_lookback_att"))
        .sort(["team", "qb_lookback_att"], descending=[False, True])
        .group_by("team", maintain_order=True)
        .agg(pl.col("player_id").first().alias("qb_lookback_id"), pl.col("qb_lookback_att").first())
        if g.height else pl.DataFrame(schema={
            "team": pl.Utf8, "qb_lookback_id": pl.Utf8, "qb_lookback_att": pl.Float64,
        })
    )
    teams = pl.concat([starters.select(["team"]), fallback.select(["team"])]).unique()
    return (
        teams.join(starters, on="team", how="left")
        .join(fallback.rename({"player_id": "fallback"}), on="team", how="left")
        .with_columns(pl.coalesce(["qb_id", "fallback"]).alias("qb_id"))
        .drop("fallback")
        .filter(pl.col("qb_id").is_not_null())
        .join(per_qb, left_on="qb_id", right_on="player_id", how="left")
        .join(tm, on="team", how="left")
        .join(lookback, on="team", how="left")
        .with_columns(
            pl.col("qb_ypa").fill_null(league_ypa),
            pl.col("team_ypa").fill_null(league_ypa),
            pl.col("n_att").fill_null(0.0),
        )
        .with_columns((pl.col("qb_ypa") / pl.col("team_ypa")).clip(lo, hi).alias("qb_pass_factor"))
        .select(["team", "qb_id", "qb_ypa", "team_ypa", "qb_pass_factor", "n_att",
                 "qb_lookback_id", "qb_lookback_att"])
        .sort("team")
    )


def _legacy_lamb(pw: pl.DataFrame, roster: pl.DataFrame, lamb_id: str,
                 season: int, week: int) -> dict:
    g = legacy_weights(pw.filter(old_window_mask(season, week)), season, week)
    raw = g.group_by("player_id").agg(
        pl.len().cast(pl.Float64).alias("n_eff"),
        common.weighted_ratio("targets", "team_targets").alias("_target_share"),
        pl.col("position").last(),
    )
    pos_mean = raw.group_by("position").agg(
        ((pl.col("_target_share") * pl.col("n_eff")).sum() / pl.col("n_eff").sum()).alias("pm")
    )
    out = raw.join(pos_mean, on="position", how="left").with_columns(
        common.shrink(pl.col("_target_share"), pl.col("n_eff"), pl.col("pm"),
                      float(OLD_K["shrink_k_usage"])).alias("target_share")
    )
    out = roster.select(["player_id"]).join(out, on="player_id", how="inner")
    row = out.filter(pl.col("player_id") == lamb_id)
    if row.is_empty():
        return {"n_eff": 0.0, "n_raw": 0.0, "target_share": None}
    r = row.row(0, named=True)
    hist = g.filter(pl.col("player_id") == lamb_id)
    return {"n_eff": float(r["n_eff"]), "n_raw": float(hist.height), "target_share": float(r["target_share"])}


def _qb_stats(q: pl.DataFrame) -> dict:
    fac = q["qb_pass_factor"]
    changed = q.filter(pl.col("qb_id") != pl.col("qb_lookback_id"))
    return {
        "n": q.height,
        "min": float(fac.min()),
        "median": float(fac.median()),
        "max": float(fac.max()),
        "n_changed": changed.height,
        "n_changed_gt1": changed.filter(pl.col("qb_pass_factor") > 1).height,
    }


def _player_row(q: pl.DataFrame, player_id: str) -> dict | None:
    row = q.filter(pl.col("qb_id") == player_id)
    if row.is_empty():
        return None
    return row.row(0, named=True)


def _share(v: float | None) -> str:
    return "None" if v is None else f"{v:.3f}"


def format_report(_ids: dict[str, str], before: dict, after: dict,
                  mass: pl.DataFrame, pts_gap_after: float | None, draws: int) -> str:
    bl, al = before["lamb"], after["lamb"]
    bw, aw = before["watson"], after["watson"]
    bq, aq = before["qb"], after["qb"]
    raw8, kish8 = incumbent_kish_vs_raw(8)
    raw6, kish6 = incumbent_kish_vs_raw(6)
    c = common.cfg()
    h = float(c["recency_half_life_weeks"])
    lines = [
        "lookback Phase 1 before/after (local, not published)",
        f"window after: S-3..S excluding week 18 of every season < S; H={h:g}",
        f"QB k sweep excluded {', '.join(CHANGED_QB_TEAMS)} (starter ≠ 2025 lookback on f049d136)",
        "32-team qb_pass_factor below INCLUDES those eight so the +3.01 bias stays visible.",
        "",
        "Lamb (CeeDee Lamb)",
        (
            f"  before  n_eff={bl['n_eff']:.2f} (raw count)  n_raw={bl['n_raw']:.0f}  "
            f"target_share={_share(bl['target_share'])}"
        ),
        (
            f"  after   n_eff={al['n_eff']:.2f} (Kish)       n_raw={al['n_raw']:.0f}  "
            f"target_share={_share(al['target_share'])}"
        ),
        "  gsis resolved from raw.players by display_name",
        "",
        "Watson (Deshaun Watson)",
        (
            f"  before  n_att={bw['n_att']:.0f}  qb_ypa={bw['qb_ypa']:.3f}  "
            f"team_ypa={bw['team_ypa']:.3f}  factor={bw['qb_pass_factor']:.3f}  "
            "(zero att filled to league)"
        ),
        (
            f"  after   n_att={aw['n_att']:.0f}  qb_ypa={aw['qb_ypa']:.3f}  "
            f"team_ypa={aw['team_ypa']:.3f}  factor={aw['qb_pass_factor']:.3f}  "
            "(n_att==0 → factor 1.0; 2024 att must not fill-to-league)"
        ),
        "  gsis resolved from raw.players by display_name",
        "",
        "32-team qb_pass_factor (all teams, including the eight)",
        (
            f"  before  min={bq['min']:.3f}  median={bq['median']:.3f}  max={bq['max']:.3f}  "
            f"starter-change factor>1: {bq['n_changed_gt1']}/{bq['n_changed']}"
        ),
        (
            f"  after   min={aq['min']:.3f}  median={aq['median']:.3f}  max={aq['max']:.3f}  "
            f"starter-change factor>1: {aq['n_changed_gt1']}/{aq['n_changed']}"
        ),
        "",
        "pts_gap vs market implied team total",
        f"  before  +{BEFORE_PTS_GAP:.2f}  run {BEFORE_RUN}  20k draws",
        (
            f"  after   {pts_gap_after:+.2f}  local {draws} draws  not published"
            if pts_gap_after is not None else
            "  after   (sim not run)"
        ),
        "  local schedules have no location column; Neutral (Melbourne) treated as home HFA",
        "",
        "3-season incumbent (17 games × 3 prior seasons, week 18 dropped)",
        (
            f"  H=8 fixture  raw={raw8:.0f}  Kish={kish8:.2f}  "
            f"λ_raw={raw8 / (raw8 + 3):.3f}  λ_kish={kish8 / (kish8 + 3):.3f}"
        ),
        (
            f"  H=6 live     raw={raw6:.0f}  Kish={kish6:.2f}  "
            f"λ_raw={raw6 / (raw6 + 3):.3f}  λ_kish={kish6 / (kish6 + 3):.3f}"
        ),
        "",
        f"weight mass at H={h:g} (team-game rows, {SEASON} week {WEEK})",
    ]
    s3_share = None
    for r in mass.iter_rows(named=True):
        share = float(r["share"])
        lines.append(f"  {int(r['season'])}  {share:.3%}")
        if int(r["season"]) == SEASON - 3:
            s3_share = share
    if s3_share is not None and s3_share < 0.02:
        lines.append(
            f"  S−3 share {s3_share:.3%} < 2% — honest window is two seasons, not three of dead rows."
        )
    lines += ["", "shrink_k old → new (Kish n_eff, 2024+2025 OOS, not lines)"]
    new = common.cfg()
    for key, old in OLD_K.items():
        lines.append(f"  {key}  {old:g} → {float(new[key]):g}")
    lines.append(
        f"  shrink_k_qb_att scoring set dropped {', '.join(CHANGED_QB_TEAMS)}"
    )
    return "\n".join(lines)


def collect(season: int = SEASON, week: int = WEEK) -> tuple[dict, dict, dict, pl.DataFrame]:
    ids = resolve_players()
    lamb_id, watson_id = ids["CeeDee Lamb"], ids["Deshaun Watson"]
    c = common.cfg()
    pw = usage.load_player_weeks(season, week)
    roster = usage.load_roster(season, week)
    starters = qb.load_starters(season, week)
    p_after = pr.build(season, week, c)
    fallback = p_after.usage.filter(pl.col("is_qb1")).select(["team", "player_id"])
    qw = qb.load_qb_weeks(season, week)
    q_before = _legacy_qb(qw, starters, fallback, season, week, {**c, **OLD_K})
    q_after = p_after.qb
    lamb_hist = common.with_weights(pw.filter(pl.col("player_id") == lamb_id), season, week, c)
    lamb_after = p_after.usage.filter(pl.col("player_id") == lamb_id)
    if lamb_after.is_empty():
        after_lamb = {"n_eff": 0.0, "n_raw": float(lamb_hist.height), "target_share": None}
    else:
        r = lamb_after.row(0, named=True)
        after_lamb = {
            "n_eff": float(r["n_eff"]),
            "n_raw": float(lamb_hist.height),
            "target_share": float(r["target_share"]),
        }
    wb = _player_row(q_before, watson_id)
    wa = _player_row(q_after, watson_id)
    if wa is None:
        raise RuntimeError("Watson is not a 2026 week-1 starter in the after table")
    if wb is None:
        raise RuntimeError("Watson is not a 2026 week-1 starter in the reconstructed before table")
    games = team.load_team_games(season, week)
    mass = common.season_weight_mass(games, season, week, c)
    before = {
        "lamb": _legacy_lamb(pw, roster, lamb_id, season, week),
        "watson": wb,
        "qb": _qb_stats(q_before),
    }
    after = {
        "lamb": after_lamb,
        "watson": wa,
        "qb": _qb_stats(q_after),
    }
    return ids, before, after, mass


def _load_games_without_location(season: int, week: int) -> pl.DataFrame:
    """load_games for local DBs that predate raw.schedules.location."""
    from ..db import read_sql

    df = read_sql(
        """
        select s.game_id, s.season, s.week, s.home_team, s.away_team, s.home_rest, s.away_rest,
               s.roof, s.wind,
               coalesce(m.spread_line, s.spread_line)::float8 as market_spread,
               coalesce(m.total_line, s.total_line)::float8 as market_total
        from raw.schedules s
        left join model.market_lines_latest m on m.game_id = s.game_id
        where s.season = %s and s.week = %s and s.game_type = 'REG'
        order by s.game_id
        """,
        (season, week),
    )
    return df.with_columns(pl.lit(None).alias("location"))


def run_sim_gap(season: int = SEASON, week: int = WEEK, draws: int = 5000) -> tuple[float, int]:
    """Local non-persisted slate. Writes parquet under data/draws/ then leaves model.* alone."""
    from psycopg.errors import UndefinedColumn

    from ..sim import slate

    orig = slate.load_games

    def _compat(s: int, w: int) -> pl.DataFrame:
        try:
            return orig(s, w)
        except UndefinedColumn:
            return _load_games_without_location(s, w)

    slate.load_games = _compat
    try:
        r = slate.run(season, week, draws=draws, note="lookback-report local", persist=False)
    finally:
        slate.load_games = orig
    return mean_pts_gap(r.proj_games), r.draws


def main(draws: int = 5000, skip_sim: bool = False) -> str:
    ids, before, after, mass = collect()
    gap, n = (None, draws) if skip_sim else run_sim_gap(draws=draws)
    text = format_report(ids, before, after, mass, gap, n)
    print(text)
    return text


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser()
    p.add_argument("--draws", type=int, default=5000)
    p.add_argument("--skip-sim", action="store_true")
    args = p.parse_args()
    main(draws=args.draws, skip_sim=args.skip_sim)
