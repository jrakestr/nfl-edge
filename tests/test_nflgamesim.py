"""Spec for benchmark/nflgamesim.py: paste parse, schedule join, CSV bytes. No DB."""
from __future__ import annotations

import csv as csv_mod
from pathlib import Path

import polars as pl
import pytest

from nfl_edge.benchmark import nflgamesim as G

FIXTURE = Path(__file__).parent / "fixtures" / "nflgamesim_week02.txt"
WEEK02_CSV = Path(__file__).parent.parent / "data" / "benchmarks" / "nflgamesim_2026_week02.csv"


def _schedules(rows: list[dict], finals: bool) -> pl.DataFrame:
    recs = []
    for r in rows:
        rec = {
            "game_id": r["game_id"], "season": int(r["season"]), "week": int(r["week"]),
            "gameday": r["gameday"], "gametime": r["gametime"],
            "home_team": r["home_team"], "away_team": r["away_team"],
            "home_score": None, "away_score": None, "result": None, "total": None,
        }
        if finals and r["status"] == "final":
            rec.update({
                "home_score": int(r["actual_home_pts"]),
                "away_score": int(r["actual_away_pts"]),
                "result": int(r["actual_margin_home"]),
                "total": int(r["actual_total"]),
            })
        recs.append(rec)
    return pl.DataFrame(recs)


def test_week2_paste_reproduces_committed_csv_byte_for_byte(tmp_path):
    expected = WEEK02_CSV.read_bytes()
    rows = list(csv_mod.DictReader(WEEK02_CSV.read_text().splitlines()))
    sched = _schedules(rows, finals=True)
    cards = G.parse_cards(FIXTURE.read_text())
    assert len(cards) == 16
    built = G.build_rows(cards, sched, 2026, 2)
    final = G.apply_actuals(built, sched)
    out = G.write_csv(final, tmp_path / "nflgamesim_2026_week02.csv")
    assert out.read_bytes() == expected


def test_ml_and_spd_are_home_first():
    sched = pl.DataFrame([{
        "game_id": "2026_02_MIA_SF", "season": 2026, "week": 2,
        "gameday": "2026-09-20", "gametime": "16:25",
        "home_team": "SF", "away_team": "MIA",
        "home_score": None, "away_score": None, "result": None, "total": None,
    }])
    cards = G.parse_cards(
        "MIA @ SF\nML: -950 / 625 Spd: -13.5 O/U: 45.5\nSF WIN 29.9-23.6 by 6.3 68.39%\n"
    )
    (row,) = G.build_rows(cards, sched, 2026, 2)
    assert (row["market_ml_home"], row["market_ml_away"]) == ("-950", "625")
    assert row["market_spread_home"] == "-13.5"
    assert (row["home_team"], row["away_team"], row["game_id"]) == ("SF", "MIA", "2026_02_MIA_SF")


def test_aliases_resolve_to_schedule_codes():
    sched = pl.DataFrame([
        {"game_id": "g1", "season": 2026, "week": 2, "gameday": "2026-09-20",
         "gametime": "16:25", "home_team": "LA", "away_team": "NYG",
         "home_score": None, "away_score": None, "result": None, "total": None},
        {"game_id": "g2", "season": 2026, "week": 2, "gameday": "2026-09-20",
         "gametime": "16:25", "home_team": "DAL", "away_team": "WAS",
         "home_score": None, "away_score": None, "result": None, "total": None},
    ])
    cards = G.parse_cards(
        "NYG @ LAR\nML: -355 / 280 Spd: -7.0 O/U: 48.5\nNYG WIN 29.4-27.3 by 2.1 58.21%\n\n"
        "WSH @ DAL\nML: -225 / 185 Spd: -3.5 O/U: 50.5\nDAL WIN 29.1-23.2 by 5.9 68.30%\n"
    )
    rows = G.build_rows(cards, sched, 2026, 2)
    assert [(r["away_team"], r["home_team"]) for r in rows] == [("NYG", "LA"), ("WAS", "DAL")]


def test_unmatched_game_fails_closed(tmp_path):
    sched = pl.DataFrame([{
        "game_id": "2026_02_MIA_SF", "season": 2026, "week": 2,
        "gameday": "2026-09-20", "gametime": "16:25",
        "home_team": "SF", "away_team": "MIA",
        "home_score": None, "away_score": None, "result": None, "total": None,
    }])
    cards = G.parse_cards(
        "MIA @ XYZ\nML: -950 / 625 Spd: -13.5 O/U: 45.5\nMIA WIN 29.9-23.6 by 6.3 68.39%\n"
    )
    out = tmp_path / "ngs.csv"
    with pytest.raises(G.UnmatchedGame):
        G.build_rows(cards, sched, 2026, 2)
    assert not out.exists()


def test_refresh_fills_week1_finals_and_push():
    pending = [
        {"game_id": "2026_01_NE_SEA", "season": "2026", "week": "1",
         "gameday": "2026-09-09", "gametime": "20:20",
         "away_team": "NE", "home_team": "SEA", "source": "nflgamesim",
         "market_spread_home": "-3.0", "market_total": "44.5",
         "market_ml_home": "-170", "market_ml_away": "142",
         "market_p_home_novig": "0.6038", "sim_home_pts": "30.2",
         "sim_away_pts": "28.1", "sim_total": "58.3", "sim_margin_home": "2.1",
         "sim_p_home_win": "0.572", "sim_pick_winner": "SEA", "sim_ats_lean": "NE",
         "sim_total_lean": "over", "edge_spread_home": "-0.9", "edge_total": "13.8",
         "edge_ml_home": "-0.0318", "status": "pending",
         "actual_home_pts": "", "actual_away_pts": "", "actual_margin_home": "",
         "actual_total": "", "actual_winner": "", "pick_winner_result": "",
         "margin_within_7": "", "ats_result": ""},
        {"game_id": "2026_01_SF_LA", "season": "2026", "week": 1,
         "gameday": "2026-09-10", "gametime": "20:35",
         "away_team": "SF", "home_team": "LA", "source": "nflgamesim",
         "market_spread_home": "-3.5", "market_total": "48.5",
         "market_ml_home": "-185", "market_ml_away": "154",
         "market_p_home_novig": "0.6225", "sim_home_pts": "32.2",
         "sim_away_pts": "27.3", "sim_total": "59.5", "sim_margin_home": "5.0",
         "sim_p_home_win": "0.637", "sim_pick_winner": "LA", "sim_ats_lean": "LA",
         "sim_total_lean": "over", "edge_spread_home": "1.5", "edge_total": "11.0",
         "edge_ml_home": "0.0145", "status": "pending",
         "actual_home_pts": "", "actual_away_pts": "", "actual_margin_home": "",
         "actual_total": "", "actual_winner": "", "pick_winner_result": "",
         "margin_within_7": "", "ats_result": ""},
    ]
    sched = pl.DataFrame([
        {"game_id": "2026_01_NE_SEA", "season": 2026, "week": 1, "gameday": "2026-09-09",
         "gametime": "20:20", "home_team": "SEA", "away_team": "NE",
         "home_score": 13, "away_score": 10, "result": 3, "total": 23},
        {"game_id": "2026_01_SF_LA", "season": 2026, "week": 1, "gameday": "2026-09-10",
         "gametime": "20:35", "home_team": "LA", "away_team": "SF",
         "home_score": 7, "away_score": 27, "result": -20, "total": 34},
    ])
    got = {r["game_id"]: r for r in G.apply_actuals(pending, sched)}
    sea = got["2026_01_NE_SEA"]
    assert sea["status"] == "final"
    assert (sea["actual_home_pts"], sea["actual_away_pts"]) == ("13", "10")
    assert (sea["actual_margin_home"], sea["actual_total"], sea["actual_winner"]) == (
        "3", "23", "SEA")
    assert sea["pick_winner_result"] == "correct" and sea["margin_within_7"] == "yes"
    assert sea["ats_result"] == "push"  # 3 + (-3.0) == 0
    sfo = got["2026_01_SF_LA"]
    assert (sfo["actual_winner"], sfo["pick_winner_result"], sfo["margin_within_7"],
            sfo["ats_result"]) == ("SF", "incorrect", "no", "incorrect")
