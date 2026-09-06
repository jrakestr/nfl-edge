"""Spec for manual prop CSV ingest, P(over) from parquet draws, and PropCallout copy. No database."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest

from nfl_edge.ingest import names as N
from nfl_edge.market import edge as E
from nfl_edge.market import props_manual as M
from nfl_edge.outputs import props as P

CFG = {"kelly_multiplier": 0.25, "flat_edge": 0.01, "strong_edge": 0.03, "default_price": -110}

CATALOG = N.prepare_catalog(
    __import__("polars").DataFrame({
        "gsis_id": ["00-0039139", "00-0033908"],
        "display_name": ["Jahmyr Gibbs", "Amon-Ra St. Brown"],
        "merge_name": ["jahmyr gibbs", "amonra st brown"],
        "latest_team": ["DET", "DET"],
        "position": ["RB", "WR"],
    })
)
TEAMS = {"DET": {"city": "Detroit", "nick": "Lions"}}


def test_parse_props_csv_two_rows(tmp_path: Path):
    p = tmp_path / "props.csv"
    p.write_text(
        "player,stat,line,over_odds,under_odds\n"
        "Jahmyr Gibbs,rush_yds,83.5,-110,-110\n"
        "Amon-Ra St. Brown,rec_yds,77.5,-112,-108\n"
    )
    rows = M.parse_props_csv(p)
    assert len(rows) == 2
    assert rows[0]["player"] == "Jahmyr Gibbs"
    assert rows[0]["stat"] == "rush_yds"
    assert rows[0]["line"] == 83.5
    assert rows[0]["over_odds"] == -110
    assert rows[1]["under_odds"] == -108


def test_parse_rejects_unknown_stat(tmp_path: Path):
    p = tmp_path / "bad.csv"
    p.write_text("player,stat,line,over_odds,under_odds\nGibbs,foo,10,-110,-110\n")
    rows = M.parse_props_csv(p)
    assert rows[0]["stat"] == "foo"
    unmatched = M.match_props(rows, CATALOG, {}, TEAMS)[1]
    assert unmatched[0]["reason"] == "bad_stat"


def test_match_unique_names():
    rows = [
        {"player": "Jahmyr Gibbs", "stat": "rush_yds", "line": 83.5,
         "over_odds": -110, "under_odds": -110, "team": None, "position": None},
        {"player": "Amon-Ra St. Brown", "stat": "rec_yds", "line": 77.5,
         "over_odds": -112, "under_odds": -108, "team": None, "position": None},
    ]
    matched, unmatched = M.match_props(rows, CATALOG, {}, TEAMS)
    assert unmatched == []
    assert matched[0]["player_id"] == "00-0039139"
    assert matched[1]["player_id"] == "00-0033908"


def test_stat_draws_anytime_td_is_rush_plus_rec():
    draws = {"rush_td": np.array([0, 1, 0, 0]), "rec_td": np.array([0, 0, 1, 0]),
             "pass_td": np.array([2, 2, 2, 2])}
    arr = P.stat_draws(draws, "anytime_td")
    assert arr.tolist() == [0, 1, 1, 0]


def test_p_over_from_draws_is_exact_not_histogram():
    vals = np.array([70.0, 80.0, 90.0, 100.0, 83.5])
    win, push, lose = E.outcome_probs(vals, 83.5)
    assert (win, push, lose) == pytest.approx((0.4, 0.2, 0.4))
    row = P.edge_row(vals, line=83.5, over_odds=-110, under_odds=-110, cfg=CFG)
    assert row["p_over"] == pytest.approx(0.4)
    assert row["p_push"] == pytest.approx(0.2)
    assert row["model_prob"] == pytest.approx(0.4 / 0.8)
    assert row["market_prob"] == pytest.approx(0.5)
    assert row["lean"] == "flat"
    assert row["under"]["model_prob"] == pytest.approx(0.4 / 0.8)


def test_half_point_line_has_no_push():
    vals = np.array([70.0, 80.0, 90.0, 100.0])
    row = P.edge_row(vals, line=83.5, over_odds=-110, under_odds=-110, cfg=CFG)
    assert row["p_push"] == 0.0
    assert row["p_over"] == pytest.approx(0.5)
    assert row["model_prob"] == pytest.approx(0.5)


def test_callout_sentence_names_the_line_and_the_book():
    s = P.callout(
        display_name="Jahmyr Gibbs",
        stat="rush_yds",
        line=83.5,
        p_over=0.61,
        over_odds=-110,
        market_prob=0.524,
        draws=20000,
    )
    assert "Gibbs" in s
    assert "83.5" in s
    assert "rushing yards" in s
    assert "61%" in s
    assert "20,000" in s
    assert "53%" in s or "52%" in s


def test_callout_keeps_st_brown():
    s = P.callout("Amon-Ra St. Brown", "rec_yds", 77.5, 0.4, -112, 0.53, 20000)
    assert s.startswith("St. Brown goes over")


def test_lean_uses_flat_then_sign_of_over_edge():
    assert P.lean(0.004, 0.01) == "flat"
    assert P.lean(0.04, 0.01) == "over"
    assert P.lean(-0.04, 0.01) == "under"
