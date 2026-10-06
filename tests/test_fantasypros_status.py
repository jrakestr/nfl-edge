"""FantasyPros injuries -> raw.player_overrides decisions. The newest information wins. Pure."""
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import polars as pl
import pytest

from nfl_edge.ingest import fantasypros_status as S

FIX = Path(__file__).parent / "fixtures"
TEAMS = {t: {"city": t, "nick": t} for t in ["NE", "TB", "GB", "LA", "TEN", "KC"]}
CATALOG = pl.DataFrame({
    "gsis_id": ["00-AJ", "00-BM", "00-TF", "00-RW"],
    "display_name": ["A.J. Brown", "Baker Mayfield", "Terrance Ferguson", "Russell Wilson"],
    "merge_name": ["aj brown", "baker mayfield", "terrance ferguson", "russell wilson"],
    "latest_team": ["NE", "TB", "LA", "FA"],
    "position": ["WR", "QB", "TE", "QB"],
})
WEEK_TEAMS = {"NE", "TB", "LA", "GB"}
PULLED = datetime(2026, 10, 6, 3, 0, tzinfo=UTC)


def inj() -> dict:
    return json.loads((FIX / "fantasypros_injuries_2026_w05.json").read_text())


def decide(existing=None):
    return S.decide(inj(), {}, CATALOG, {}, TEAMS, WEEK_TEAMS, existing or {}, PULLED)


def by_id(d):
    return {u["player_id"]: u for u in d["upserts"]}


def test_ir_and_out_become_out_rows_with_fp_note():
    u = by_id(decide())
    assert u["00-AJ"]["status"] == "out" and u["00-AJ"]["usage_multiplier"] == 0.0
    assert u["00-AJ"]["note"] == "fp IR 2026-10-06"
    assert u["00-TF"]["status"] == "out"   # LAR -> LA


def test_questionable_with_no_saved_row_is_not_written():
    d = decide()
    assert "00-BM" not in by_id(d)
    assert d["questionable_without_saved_row"] == 1


def test_non_skill_free_agent_and_off_week_rows_are_skipped():
    d = decide()
    assert "00-RW" not in by_id(d)               # FA team
    assert d["ignored"]["non_skill"] >= 1        # LB / DE
    d2 = S.decide(inj(), {}, CATALOG, {}, TEAMS, {"GB"}, {}, PULLED)
    assert d2["upserts"] == [] and d2["ignored"]["off_week"] >= 1


def test_newer_fantasypros_out_replaces_older_other_source_row():
    old = PULLED - timedelta(days=1)
    d = decide({"00-AJ": {"status": "questionable", "note": "rts+src2 q 8.0/7.5", "updated_at": old}})
    aj = by_id(d)["00-AJ"]
    assert aj["status"] == "out" and aj["old"] == "questionable" and aj["replaces"] == "other source"


def test_newer_other_source_row_is_kept_over_fantasypros():
    new = PULLED + timedelta(minutes=5)
    d = decide({"00-AJ": {"status": "questionable", "note": "manual: practiced", "updated_at": new}})
    assert "00-AJ" not in by_id(d)
    assert [k["player_id"] for k in d["kept_newer"]] == ["00-AJ"]
    assert d["kept_newer"][0]["saved_status"] == "questionable"


def test_fantasypros_report_older_than_manual_entry_loses_even_though_feed_was_just_pulled():
    # Mayfield's Q was reported 2026-10-05 00:00; a manual OUT saved later that day is newer.
    manual = datetime(2026, 10, 5, 18, 0, tzinfo=UTC)
    d = decide({"00-BM": {"status": "out", "note": "manual: ruled out", "updated_at": manual}})
    assert "00-BM" not in by_id(d)
    assert [k["player_id"] for k in d["kept_newer"]] == ["00-BM"]


def test_newer_fantasypros_questionable_replaces_older_out():
    older = datetime(2026, 10, 4, 12, 0, tzinfo=UTC)
    d = decide({"00-BM": {"status": "out", "note": "dk O", "updated_at": older}})
    bm = by_id(d)["00-BM"]
    assert bm["status"] == "questionable" and bm["usage_multiplier"] == 1.0
    assert bm["note"] == "fp Q 2026-10-05"


def test_same_status_other_source_row_is_left_alone():
    d = decide({"00-AJ": {"status": "out", "note": "dk O", "updated_at": PULLED - timedelta(days=2)}})
    assert "00-AJ" not in by_id(d)
    assert "00-AJ" in {a["player_id"] for a in d["already"]}


def test_own_row_unchanged_is_already_and_changed_is_updated():
    first = by_id(decide())
    existing = {pid: {"status": u["status"], "note": u["note"], "updated_at": PULLED} for pid, u in first.items()}
    d = decide(existing)
    assert d["upserts"] == [] and {a["player_id"] for a in d["already"]} == set(first)
    existing["00-AJ"] = {"status": "doubtful", "note": "fp D 2026-10-01", "updated_at": PULLED}
    aj = by_id(decide(existing))["00-AJ"]
    assert aj["status"] == "out" and aj["old"] == "doubtful" and aj["replaces"] == "fantasypros"


def test_saved_fp_row_no_longer_listed_is_reported_and_left_in_place():
    existing = {"00-ZZ": {"status": "out", "note": "fp IR 2026-09-20", "updated_at": PULLED},
                "00-YY": {"status": "out", "note": "dk O", "updated_at": PULLED}}
    d = decide(existing)
    assert [s["player_id"] for s in d["stale"]] == ["00-ZZ"]


def test_run_dry_run_writes_nothing(monkeypatch):
    class C:
        calls = 1

        def injuries(self, season, week):
            return inj()

    monkeypatch.setattr(S, "_load", lambda season, week: (CATALOG, {}, WEEK_TEAMS, {}))
    wrote = []
    monkeypatch.setattr(S, "write_overrides", lambda df: wrote.append(df) or df.height)
    r = S.run(2026, 5, dry_run=True, client=C())
    assert wrote == [] and r["written"] == 0 and r["upserts"]
    r2 = S.run(2026, 5, dry_run=False, client=C())
    assert len(wrote) == 1 and r2["written"] == len(r2["upserts"])


def test_run_fails_closed_before_writes(monkeypatch):
    class Boom:
        calls = 0

        def injuries(self, season, week):
            from nfl_edge.ingest.fantasypros import FantasyProsError
            raise FantasyProsError("FantasyPros /nfl/injuries returned HTTP 500; nothing written")

    wrote = []
    monkeypatch.setattr(S, "write_overrides", lambda df: wrote.append(df) or 0)
    with pytest.raises(Exception, match="nothing written"):
        S.run(2026, 5, client=Boom())
    assert wrote == []
