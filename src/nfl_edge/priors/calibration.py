"""Realized-outcome calibration: correct systematic misses the graded weeks already showed.

As-of: week W of season S fits only on model.player_proj_actual rows with week < W (projections
made before those games, scored against what happened). No graded weeks -> no change.

Channels (each a ratio of realized to projected, shrunk toward 1 by sample size, clipped):
  pass_rate   pass share of attempts + carries      -> team neutral_pass_rate
  qb_carry    QB carries                             -> QB carry_share (renormalized to RBs etc.)
  target_POS  RB / WR / TE share of team targets     -> target_share by position (renormalized)
Role: a player whose team's recent games show him under min_pct of offensive snaps gets no
usage (depth-chart starters, QB1 and players with no recent snap rows are never zeroed).

Shrink: w = n / (n + k), n = graded team-games, k from sim.yaml (one week of games -> about
half weight). Fit on volume and shares only; never against posted prop lines.
"""
from __future__ import annotations

import polars as pl

from ..db import read_sql

POSITIONS = ("RB", "WR", "TE")
NO_CHANGE = {"pass_rate": 1.0, "qb_carry": 1.0, "target_RB": 1.0, "target_WR": 1.0,
             "target_TE": 1.0}
CLIP = (0.75, 1.25)
SHARE_COLS = ("target_share", "carry_share", "rz_target_share", "rz_carry_share")


def _shrink(raw: float | None, w: float) -> float:
    if raw is None:
        return 1.0
    return min(CLIP[1], max(CLIP[0], 1.0 + w * (raw - 1.0)))


def _ratio(num: float, den: float) -> float | None:
    return num / den if den > 0 and num >= 0 else None


def fit(cells: list[dict], k: float = 32.0) -> dict[str, float]:
    """Factors from per-team-game projected/actual volume. Empty -> NO_CHANGE."""
    if not cells:
        return dict(NO_CHANGE)

    def tot(key: str) -> float:
        return float(sum(float(c.get(key) or 0.0) for c in cells))

    w = len(cells) / (len(cells) + float(k))
    pp, pc, ap, ac = tot("proj_pass_att"), tot("proj_carries"), tot("act_pass_att"), tot("act_carries")
    share_p = _ratio(pp, pp + pc)
    share_a = _ratio(ap, ap + ac)
    out = {"pass_rate": _shrink(_ratio(share_a, share_p) if share_a and share_p else None, w),
           "qb_carry": _shrink(_ratio(tot("act_qb_carries"), tot("proj_qb_carries")), w)}
    proj_t = sum(tot(f"proj_{p.lower()}_targets") for p in POSITIONS)
    act_t = sum(tot(f"act_{p.lower()}_targets") for p in POSITIONS)
    for p in POSITIONS:
        sp = _ratio(tot(f"proj_{p.lower()}_targets"), proj_t)
        sa = _ratio(tot(f"act_{p.lower()}_targets"), act_t)
        out[f"target_{p}"] = _shrink(_ratio(sa, sp) if sa is not None and sp else None, w)
    return out


def apply_usage(usage: pl.DataFrame, f: dict[str, float], shares: dict[str, float],
                starters: set[str], min_pct: float = 0.10) -> pl.DataFrame:
    """Scale shares by channel, zero players with no offensive role, renormalize per team."""
    if usage.is_empty():
        return usage
    pos = pl.col("position").fill_null("").replace({"FB": "RB", "HB": "RB"})
    t_mult = pl.lit(1.0)
    for p in POSITIONS:
        t_mult = pl.when(pos == p).then(pl.lit(float(f.get(f"target_{p}", 1.0)))).otherwise(t_mult)
    c_mult = pl.when(pos == "QB").then(pl.lit(float(f.get("qb_carry", 1.0)))).otherwise(pl.lit(1.0))
    no_role = [pid for pid, s in shares.items() if s < min_pct and pid not in starters]
    keep_qb1 = pl.col("is_qb1").fill_null(False) if "is_qb1" in usage.columns else pl.lit(False)
    alive = (~pl.col("player_id").is_in(no_role) | keep_qb1).cast(pl.Float64)
    out = usage.with_columns(
        (pl.col("target_share") * t_mult * alive).alias("target_share"),
        (pl.col("rz_target_share") * t_mult * alive).alias("rz_target_share"),
        (pl.col("carry_share") * c_mult * alive).alias("carry_share"),
        (pl.col("rz_carry_share") * c_mult * alive).alias("rz_carry_share"),
    )
    for c in SHARE_COLS:
        if c not in out.columns:
            continue
        s = pl.col(c).sum().over("team")
        out = out.with_columns(pl.when(s > 0).then(pl.col(c) / s).otherwise(pl.col(c)).alias(c))
    return out


def apply_teams(teams: pl.DataFrame, f: dict[str, float]) -> pl.DataFrame:
    if teams.is_empty() or "neutral_pass_rate" not in teams.columns:
        return teams
    return teams.with_columns(
        (pl.col("neutral_pass_rate") * float(f.get("pass_rate", 1.0))).clip(0.3, 0.85)
        .alias("neutral_pass_rate"))


def load_cells(season: int, week: int) -> list[dict]:
    """Per team-game projected and actual volume from graded weeks before `week`."""
    return read_sql(
        """
        select week, game_id, team,
          sum(case when position = 'QB' then coalesce(proj_pass_att, 0) end) as proj_pass_att,
          sum(case when position = 'QB' then coalesce(actual_pass_att, 0) end) as act_pass_att,
          sum(coalesce(proj_carries, 0)) as proj_carries,
          sum(coalesce(actual_carries, 0)) as act_carries,
          sum(case when position = 'QB' then coalesce(proj_carries, 0) else 0 end) as proj_qb_carries,
          sum(case when position = 'QB' then coalesce(actual_carries, 0) else 0 end) as act_qb_carries,
          sum(case when position in ('RB', 'FB') then coalesce(proj_targets, 0) else 0 end) as proj_rb_targets,
          sum(case when position in ('RB', 'FB') then coalesce(actual_targets, 0) else 0 end) as act_rb_targets,
          sum(case when position = 'WR' then coalesce(proj_targets, 0) else 0 end) as proj_wr_targets,
          sum(case when position = 'WR' then coalesce(actual_targets, 0) else 0 end) as act_wr_targets,
          sum(case when position = 'TE' then coalesce(proj_targets, 0) else 0 end) as proj_te_targets,
          sum(case when position = 'TE' then coalesce(actual_targets, 0) else 0 end) as act_te_targets
        from model.player_proj_actual
        where season = %s and week < %s
        group by week, game_id, team
        """,
        (season, week),
    ).to_dicts()


def load_target_rate(season: int, week: int) -> float:
    """League targets per pass attempt over the as-of history window (1.0 without history)."""
    from . import common

    hist = common.history_where(season, week)
    df = read_sql(
        f"select sum((stats->>'targets')::float8) as t, sum((stats->>'attempts')::float8) as a "
        f"from raw.player_stats_weekly where {hist}"
    )
    if df.is_empty() or not df[0, "a"]:
        return 1.0
    return float(min(1.0, max(0.5, df[0, "t"] / df[0, "a"])))
