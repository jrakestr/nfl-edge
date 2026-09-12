"""Snapshot of in-memory team/QB inputs onto model.run_team_inputs.

Copy only. Does not change prior formulas. slate.run writes immediately after sim_runs
so a persisted run cannot exist without its inputs. Does not rebuild priors from raw tables.
"""
from __future__ import annotations

import polars as pl

from .. import priors as pr
from ..db import insert


def snapshot_from_priors(run_id: str, priors: pr.Priors, cfg: dict) -> pl.DataFrame:
    """One row per team from the in-memory priors object. Empty frame if no teams."""
    from ..sim.slate import team_prior

    teams: set[str] = set()
    if not priors.team.teams.is_empty():
        teams.update(priors.team.teams["team"].to_list())
    if not priors.qb.is_empty():
        teams.update(priors.qb["team"].to_list())
    league = priors.team.league
    rows = []
    for team in sorted(teams):
        raw = priors.team.teams.filter(pl.col("team") == team)
        raw_d = raw.row(0, named=True) if not raw.is_empty() else {k: league[k] for k in league}
        prior = team_prior(priors, team, cfg)
        qb = priors.qb.filter(pl.col("team") == team)
        q = qb.row(0, named=True) if not qb.is_empty() else {}
        rows.append({
            "run_id": run_id,
            "team": team,
            "off_ppd_raw": float(raw_d.get("off_ppd") if raw_d.get("off_ppd") is not None else league["off_ppd"]),
            "off_ppd_adj": float(prior.off_ppd),
            "def_ppd_allowed": float(prior.def_ppd_allowed),
            "drives_mean": float(prior.drives_mean),
            "plays_per_drive": float(prior.plays_per_drive),
            "neutral_pass_rate": float(prior.neutral_pass_rate),
            "qb_starter_id": q.get("qb_id"),
            "qb_lookback_id": q.get("qb_lookback_id"),
            "qb_lookback_att": None if q.get("qb_lookback_att") is None else float(q["qb_lookback_att"]),
            "qb_starter_att": None if q.get("n_att") is None else float(q["n_att"]),
            "qb_pass_factor": None if q.get("qb_pass_factor") is None else float(q["qb_pass_factor"]),
            "league_off_ppd": float(league["off_ppd"]),
            "league_def_ppd_allowed": float(league["def_ppd_allowed"]),
        })
    if not rows:
        return pl.DataFrame(schema={
            "run_id": pl.Utf8, "team": pl.Utf8, "off_ppd_raw": pl.Float64, "off_ppd_adj": pl.Float64,
            "def_ppd_allowed": pl.Float64, "drives_mean": pl.Float64, "plays_per_drive": pl.Float64,
            "neutral_pass_rate": pl.Float64, "qb_starter_id": pl.Utf8, "qb_lookback_id": pl.Utf8,
            "qb_lookback_att": pl.Float64, "qb_starter_att": pl.Float64, "qb_pass_factor": pl.Float64,
            "league_off_ppd": pl.Float64, "league_def_ppd_allowed": pl.Float64,
        })
    return pl.DataFrame(rows)


def persist_snapshot(run_id: str, priors: pr.Priors, cfg: dict) -> int:
    frame = snapshot_from_priors(run_id, priors, cfg)
    if frame.is_empty():
        raise ValueError("run_team_inputs empty")
    return insert(frame, "model.run_team_inputs")
