"""Spec for grading prop_edges against player_stats_weekly. Skip when unpublished."""
from nfl_edge.results import prop_grade as P


def test_actual_stat_maps_nflverse_keys():
    stats = {
        "rushing_yards": 91, "receiving_yards": 40, "receptions": 5,
        "rushing_tds": 1, "receiving_tds": 0, "passing_yards": 0, "passing_tds": 0,
    }
    assert P.actual_stat(stats, "rush_yds") == 91
    assert P.actual_stat(stats, "rec_yds") == 40
    assert P.actual_stat(stats, "rec") == 5
    assert P.actual_stat(stats, "anytime_td") == 1


def test_prop_outcome_over_under_push():
    assert P.prop_outcome("over", 83.5, 91) == 1
    assert P.prop_outcome("under", 83.5, 91) == 0
    assert P.prop_outcome("over", 83.5, 70) == 0
    assert P.prop_outcome("over", 83.0, 83.0) is None


def test_skip_unpublished():
    r = P.skip_unpublished(2026, 1)
    assert r["skipped"] is True
    assert r["reason"] == "scores unpublished"
    assert r["n_rows"] == 0


def test_actual_stat_maps_td_and_int_keys():
    stats = {"rushing_tds": 0, "receiving_tds": 2, "interceptions": 1}
    assert P.actual_stat(stats, "rush_td") == 0
    assert P.actual_stat(stats, "rec_td") == 2
    assert P.actual_stat(stats, "int") == 1
    assert P.actual_stat(stats, "anytime_td") == 2


def test_fair_over_hit_is_above_or_below_our_line():
    assert P.fair_over_hit(83.5, 91) == 1
    assert P.fair_over_hit(83.5, 70) == 0
    assert P.fair_over_hit(83.5, 83.5) is None
    assert P.fair_over_hit(0.5, 1) == 1
    assert P.fair_over_hit(0.5, 0) == 0
