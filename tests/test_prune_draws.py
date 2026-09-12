"""Keep-set and week-gate for prune-draws. No DB."""
from datetime import date

from nfl_edge.rebuild import plan_week_runs, week_gate


def test_week_gate_skips_until_every_game_is_graded():
    gate, reason = week_gate(
        ["2026_01_WAS_PHI"], current=1, week=1,
        last_gameday=date(2026, 9, 14), today=date(2026, 9, 12),
    )
    assert gate == "skip"
    assert "waiting on grades for 2026_01_WAS_PHI" in reason


def test_week_gate_ready_when_no_holes():
    gate, reason = week_gate(
        [], current=2, week=1, last_gameday=date(2026, 9, 14), today=date(2026, 9, 16),
    )
    assert gate == "ready"
    assert reason == "fully graded"


def test_week_gate_age_fallback_two_weeks_behind():
    gate, reason = week_gate(
        ["2026_01_WAS_PHI", "2026_01_DAL_PHI"],
        current=3, week=1, last_gameday=date(2026, 9, 14), today=date(2026, 9, 24),
    )
    assert gate == "age"
    assert "age fallback, still ungraded 2026_01_WAS_PHI, 2026_01_DAL_PHI" in reason


def test_week_gate_age_fallback_without_current_week_uses_gameday():
    gate, reason = week_gate(
        ["2025_10_DEN_LV"], current=None, week=10,
        last_gameday=date(2025, 11, 9), today=date(2025, 11, 24),
    )
    assert gate == "age"
    assert "2025_10_DEN_LV" in reason


def test_week_gate_previous_week_still_waits():
    gate, _ = week_gate(
        ["2026_02_KC_BUF"], current=3, week=2,
        last_gameday=date(2026, 9, 21), today=date(2026, 9, 24),
    )
    assert gate == "skip"


def test_plan_week_runs_keeps_newest_and_results_prunes_the_rest():
    newest = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
    graded = "bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbb2"
    extra = "ccccccc3-cccc-4ccc-8ccc-ccccccccccc3"
    orphan = "ddddddd4-dddd-4ddd-8ddd-ddddddddddd4"
    actions = dict(plan_week_runs(
        [newest, graded, extra],
        {graded},
        [newest, graded, extra, orphan],
    ))
    assert actions[newest] == "keep_newest"
    assert actions[graded] == "keep_results"
    assert actions[extra] == "prune"
    assert actions[orphan] == "orphan"


def test_plan_week_runs_newest_wins_over_results_label():
    rid = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
    actions = dict(plan_week_runs([rid], {rid}, [rid]))
    assert actions[rid] == "keep_newest"
