"""Spec for DFS lineup grading against player_stats_weekly. Pure functions; skip when unpublished."""
from __future__ import annotations

import numpy as np
import pytest

from nfl_edge.config import load_yaml
from nfl_edge.results import dfs_grade as D
from nfl_edge.sim import scoring

RULES = load_yaml("scoring.yaml")


def test_scores_unpublished_when_no_weekly_rows():
    assert D.scores_published(0) is False
    assert D.scores_published(12) is True


def test_stats_json_maps_nflverse_keys_to_scoring_keys():
    raw = {
        "passing_yards": 250, "passing_tds": 2, "passing_interceptions": 1,
        "rushing_yards": 20, "rushing_tds": 0, "carries": 4,
        "receptions": 0, "receiving_yards": 0, "receiving_tds": 0,
        "rushing_fumbles_lost": 0, "receiving_fumbles_lost": 0, "sack_fumbles_lost": 0,
        "passing_2pt_conversions": 1,
    }
    s = D.offense_from_weekly(raw)
    pts = scoring.score_offense({k: np.array([v]) for k, v in s.items()}, RULES)
    assert s["int"] == 1
    assert s["two_pt"] == 1
    assert pts["dk"][0] == pytest.approx(250 * 0.04 + 2 * 4 - 1 + 20 * 0.1 + 2)


def test_lineup_dk_points_sums_skill_players():
    gibbs = D.offense_from_weekly({
        "rushing_yards": 105, "rushing_tds": 1, "receptions": 4, "receiving_yards": 30,
        "receiving_tds": 0, "rushing_fumbles_lost": 1,
    })
    total = D.lineup_dk_points([gibbs, gibbs], RULES)
    one = scoring.score_offense({k: np.array([v]) for k, v in gibbs.items()}, RULES)["dk"][0]
    assert total == pytest.approx(2 * one)


def test_lineup_dk_points_none_when_a_player_has_no_stats():
    gibbs = D.offense_from_weekly({"rushing_yards": 80})
    assert D.lineup_dk_points([gibbs, None], RULES) is None


def test_skip_report_when_unpublished():
    r = D.skip_unpublished(2026, 1)
    assert r["skipped"] is True
    assert r["reason"] == "scores unpublished"
    assert r["season"] == 2026
    assert r["week"] == 1
    assert r["n_lineups"] == 0


def _team(team, opp, **stats):
    return {"team": team, "opponent_team": opp, "stats": stats}


def test_dst_points_come_from_score_dst_not_a_zero_row():
    rows = [
        _team("KC", "LV", def_sacks=4, def_interceptions=1, fumble_recovery_opp=1, def_tds=1,
              def_fg_blocks=1),
        _team("LV", "KC"),
    ]
    scores = [{"home_team": "KC", "away_team": "LV", "home_score": 27, "away_score": 6}]
    out = D.dst_actuals(rows, scores, RULES)
    # 4 sacks + 1 int (2) + 1 fum rec (2) + TD (6) + block (2) + 6 allowed (7)
    assert out["KC"] == pytest.approx(4 + 2 + 2 + 6 + 2 + 7)
    assert out["LV"] == pytest.approx(0)  # 27 - 6 (KC defensive TD) = 21 allowed


def test_dst_points_allowed_excludes_opponent_defensive_and_special_teams_scores():
    rows = [
        _team("BUF", "NE", def_safeties=1),
        _team("NE", "BUF", def_tds=1, special_teams_tds=1),
    ]
    scores = [{"home_team": "BUF", "away_team": "NE", "home_score": 10, "away_score": 14}]
    out = D.dst_actuals(rows, scores, RULES)
    # NE scored 14, 12 of it defense + special teams: 2 allowed (7 pts) plus BUF's safety (2).
    assert out["BUF"] == pytest.approx(7 + 2 * 1)


def test_dst_absent_when_opponent_row_or_score_missing():
    rows = [_team("KC", "LV", def_sacks=2)]
    scores = [{"home_team": "KC", "away_team": "LV", "home_score": 20, "away_score": 10}]
    assert D.dst_actuals(rows, scores, RULES) == {}
    rows.append(_team("LV", "KC"))
    unplayed = [{"home_team": "KC", "away_team": "LV", "home_score": None, "away_score": None}]
    assert D.dst_actuals(rows, unplayed, RULES) == {}


def test_slot_points_none_for_missing_skill_player_and_dst():
    weekly = {"p1": {"rushing_yards": 100, "rushing_tds": 1, "carries": 20}}
    dst = {"KC": 12.0}
    assert D.slot_points("p1", weekly, dst, RULES) == pytest.approx(10 + 6 + 3)
    assert D.slot_points("p2", weekly, dst, RULES) is None
    assert D.slot_points("KC_DST", weekly, dst, RULES) == 12.0
    assert D.slot_points("LV_DST", weekly, dst, RULES) is None
    assert D.slot_points(None, weekly, dst, RULES) is None


def test_lineup_total_none_when_any_slot_is_missing():
    assert D.lineup_total([10.0, 2.5, 0.0]) == pytest.approx(12.5)
    assert D.lineup_total([10.0, None]) is None


def test_run_writes_nothing_when_no_game_is_final(monkeypatch):
    import polars as pl

    from nfl_edge.results import slate_actuals as SA

    monkeypatch.setattr(SA, "run", lambda s, w: {})
    monkeypatch.setattr(SA, "index", lambda s, w: {})
    monkeypatch.setattr(D, "read_sql", lambda q, p=None: pl.DataFrame())
    monkeypatch.setattr(D, "persist", lambda g: pytest.fail("must not write"))
    r = D.run(2026, 6)
    assert r["skipped"] is False
    assert r["n_complete"] == 0 and r["written"] == 0


def test_run_persists_only_fully_final_lineups(monkeypatch):
    import polars as pl

    from nfl_edge.results import slate_actuals as SA

    lineup = lambda names: {"players": [{"name": n, "slot": "X", "dk_id": n} for n in names]}
    lineups = pl.DataFrame({
        "id": [1, 2], "lineup_id": ["0", "1"], "slate_id": ["s", "s"], "site": ["dk", "dk"],
        "sim_win_pct": [0.1, 0.1], "proj_fpts": [100.0, 100.0],
        "lineup": [lineup(["a", "KC"]), lineup(["a", "ghost"])],
    })
    sal = pl.DataFrame({"player_dk_id": ["a", "KC", "ghost"],
                        "player_id": ["pa", "KC_DST", "pg"]})
    monkeypatch.setattr(SA, "run", lambda s, w: {})
    monkeypatch.setattr(SA, "index", lambda s, w: {
        "pa": {"dk_pts": 5.0, "state": "final", "game_id": "g1"},
        "KC_DST": {"dk_pts": 9.0, "state": "final", "game_id": "g1"},
        "pg": {"dk_pts": 3.0, "state": "live", "game_id": "g2"},
    })
    monkeypatch.setattr(
        D, "read_sql", lambda q, p=None: sal if "dk_salaries" in q else lineups
    )
    saved = {}
    monkeypatch.setattr(D, "persist", lambda g: saved.setdefault("g", g) and len(g))
    r = D.run(2026, 6, run_id="rid")
    assert r["n_complete"] == 1 and r["n_partial"] == 1
    assert r["open_games"] == ["g2"]
    assert r["missing"] == {"ghost": 1}
    by_id = {g["id"]: g["actual_fpts"] for g in saved["g"]}
    assert list(by_id) == [1]
    assert by_id[1] == pytest.approx(5.0 + 9.0)
