"""run_team_inputs snapshot copies in-memory priors; factor math is unchanged."""
from __future__ import annotations

import polars as pl
import pytest

from nfl_edge.outputs.team_inputs import snapshot_from_priors
from nfl_edge.priors import Priors, qb, team
from nfl_edge.sim import slate

QCFG = {
    "lookback_weeks": 8, "prior_season_weight": 0.35, "shrink_k_team": 4,
    "shrink_k_qb_att": 150, "qb_factor_clip": [0.8, 1.2], "qb_att_share_prior": 0.97,
    "shrink_k_qb_share": 3,
}


def _qb_weeks():
    rows = []
    for w in range(1, 9):
        rows.append((2025, w, "star", "T", 30.0, 240.0, 31.0, 247.0))
        rows.append((2025, w, "mop", "T", 1.0, 7.0, 31.0, 247.0))
        rows.append((2025, w, "avg", "U", 30.0, 210.0, 30.0, 210.0))
    return pl.DataFrame(rows, orient="row", schema=["season", "week", "player_id", "team", "attempts",
                                                    "pass_yds", "team_attempts", "team_pass_yds"])


def _priors() -> Priors:
    games = pl.DataFrame(
        [
            (2025, 1, "T", 63, 11, 24, 2, 2, 1, 35, 37, 2, 1, 0.58, 24, 11),
            (2025, 2, "T", 63, 11, 24, 2, 2, 1, 35, 37, 2, 1, 0.58, 24, 11),
            (2025, 1, "U", 63, 11, 24, 2, 2, 1, 35, 37, 2, 1, 0.58, 24, 11),
            (2025, 2, "U", 63, 11, 24, 2, 2, 1, 35, 37, 2, 1, 0.58, 24, 11),
        ],
        orient="row",
        schema=["season", "week", "team", "plays", "drives", "points", "fg_made", "td", "pass_td",
                "pass_att", "dropbacks", "sacks", "interceptions", "neutral_pass_rate",
                "opp_points", "opp_drives"],
    )
    tp = team.build(games, 2025, 9, {"lookback_weeks": 8, "prior_season_weight": 0.35, "shrink_k_team": 4})
    q = qb.build(
        _qb_weeks(),
        pl.DataFrame({"team": ["T"], "qb_id": ["star"]}),
        pl.DataFrame({"team": ["T"], "player_id": ["star"]}),
        2025, 9, QCFG,
    )
    return Priors(season=2025, week=9, team=tp, usage=pl.DataFrame(), efficiency=pl.DataFrame(), qb=q)


def test_snapshot_copies_raw_and_adj_and_lookback():
    cfg = {"priors": {"qb_ppd_elasticity": 0.6}}
    p = _priors()
    frame = snapshot_from_priors("run-1", p, cfg)
    row = frame.filter(pl.col("team") == "T").row(0, named=True)
    raw = p.team.teams.filter(pl.col("team") == "T")["off_ppd"][0]
    adj = slate.team_prior(p, "T", cfg).off_ppd
    assert row["off_ppd_raw"] == pytest.approx(raw)
    assert row["off_ppd_adj"] == pytest.approx(adj)
    assert row["qb_starter_id"] == "star"
    assert row["qb_lookback_id"] == "star"
    assert row["qb_starter_att"] == pytest.approx(240.0)
    assert row["qb_pass_factor"] == pytest.approx(1.0, abs=0.02)
    assert row["league_off_ppd"] == pytest.approx(p.team.league["off_ppd"])
    assert row["league_def_ppd_allowed"] == pytest.approx(p.team.league["def_ppd_allowed"])


def test_empty_priors_frame_is_empty():
    from nfl_edge.priors.team import TeamPriors

    p = Priors(
        season=2025,
        week=9,
        team=TeamPriors(teams=pl.DataFrame(schema={"team": pl.Utf8}), league={"off_ppd": 2.1, "def_ppd_allowed": 2.1}),
        usage=pl.DataFrame(),
        efficiency=pl.DataFrame(),
        qb=pl.DataFrame(),
    )
    assert snapshot_from_priors("run-1", p, {"priors": {}}).is_empty()
