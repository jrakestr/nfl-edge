"""Spec for manual prop CSV ingest, P(over) from parquet draws, and PropCallout copy. No database."""
from __future__ import annotations

from pathlib import Path

import numpy as np
import polars as pl
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


def test_last_name_skips_jr():
    assert P.last_name("Brian Robinson Jr.") == "Robinson"
    s = P.callout("Brian Robinson Jr.", "rush_yds", 70.5, 0.4, -110, 0.53, 20000)
    assert s.startswith("Robinson goes over")
    assert "Jr" not in s


def test_skip_report_counts_unknown_stats():
    skipped = (
        [{"stat": "pass_rush", "reason": "bad_stat"}] * 9
        + [{"stat": "total_yds", "reason": "bad_stat"}] * 5
        + [{"stat": "rush_yds", "reason": "no_draws"}]
    )
    assert P.skip_report(skipped) == "skipped 14 market_props: pass_rush 9, total_yds 5"
    assert P.skip_report([{"stat": "rush_yds", "reason": "no_draws"}]) is None


def test_player_cols_unknown_stat_raises(tmp_path: Path):
    pq = tmp_path / "g.parquet"
    pl.DataFrame({"player_id": ["p1"], "rush_yds": [10]}).write_parquet(pq)
    with pytest.raises(KeyError):
        P._player_cols(pq, "p1", "pass_rush")


def test_lean_uses_flat_then_sign_of_over_edge():
    assert P.lean(0.004, 0.01) == "flat"
    assert P.lean(0.04, 0.01) == "over"
    assert P.lean(-0.04, 0.01) == "under"


def test_round_to_half_always_lands_on_x5():
    assert P.round_to_half(83.0) == 83.5
    assert P.round_to_half(83.2) == 83.5
    assert P.round_to_half(83.9) == 83.5
    assert P.round_to_half(0.0) == 0.5
    assert P.round_to_half(1.0) == 1.5


def test_fair_line_is_median_rounded_to_half():
    vals = np.array([70.0, 80.0, 83.0, 90.0, 100.0])
    assert P.fair_line(vals) == 83.5


def test_anytime_td_is_prob_of_at_least_one():
    rush = np.array([0, 1, 0, 0])
    rec = np.array([0, 0, 1, 0])
    assert P.anytime_td_prob(rush, rec) == pytest.approx(0.5)
    assert P.anytime_td_prob(np.zeros(4), np.zeros(4)) == pytest.approx(0.0)
    assert P.anytime_td_prob(np.ones(4), np.zeros(4)) == pytest.approx(1.0)


def test_p_over_at_fair_line_matches_parquet_draws():
    vals = np.array([70.0, 80.0, 83.0, 90.0, 100.0])
    line = P.fair_line(vals)
    assert line == 83.5
    assert P.p_over_at(vals, line) == pytest.approx(float((vals > line).mean()))
    assert P.p_over_at(vals, line) == pytest.approx(0.4)


def test_fair_row_anytime_td_stores_probability_at_half_line():
    rush = np.array([0, 0, 1, 1, 0])
    rec = np.array([0, 0, 0, 1, 0])
    row = P.fair_row("anytime_td", rush, rec=rec)
    assert row["fair_line"] == 0.5
    assert row["p_over"] == pytest.approx(0.4)
    assert row["p_over"] == pytest.approx(P.p_over_at(rush + rec, 0.5))


def test_fair_callout_uses_our_line_when_no_market():
    s = P.fair_callout("rush_yds", 78.5, mean=76.2, p10=42.1, p90=118.4)
    assert "Our line is 78.5" in s
    assert "typical game lands at 76" in s
    assert "one in ten under 42" in s
    assert "one in ten over 118" in s


def test_fair_callout_anytime_td_is_american_price():
    s = P.fair_callout("anytime_td", 0.5, mean=0.6, p10=0.0, p90=2.0, p_over=0.40)
    assert "+" in s or "\u2212" in s
    assert "78.5" not in s
