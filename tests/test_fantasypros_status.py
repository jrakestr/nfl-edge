"""FantasyPros injuries -> source-scoped raw.player_overrides decisions. Pure; no database."""
import json
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


def inj() -> dict:
    return json.loads((FIX / "fantasypros_injuries_2026_w05.json").read_text())


def decide(existing=None):
    return S.decide(inj(), {}, CATALOG, {}, TEAMS, WEEK_TEAMS, existing or {})


def test_ir_and_out_become_out_rows_with_fp_note():
    d = decide()
    by = {u["player_id"]: u for u in d["upserts"]}
    aj = by["00-AJ"]
    assert aj["status"] == "out" and aj["usage_multiplier"] == 0.0
    assert aj["note"].startswith("fp IR ")
    assert by["00-TF"]["status"] == "out"   # LAR -> LA


def test_questionable_is_ignored_not_written():
    d = decide()
    assert "00-BM" not in {u["player_id"] for u in d["upserts"]}
    assert d["ignored"]["questionable"] >= 1


def test_non_skill_free_agent_and_off_week_rows_are_skipped():
    d = decide()
    ids = {u["player_id"] for u in d["upserts"]}
    assert "00-RW" not in ids                     # FA team
    assert d["ignored"]["non_skill"] >= 1         # LB / DE
    d2 = S.decide(inj(), {}, CATALOG, {}, TEAMS, {"GB"}, {})
    assert d2["upserts"] == []                    # NE/LA not playing this week
    assert d2["ignored"]["off_week"] >= 1


def test_other_sources_rows_are_never_touched():
    existing = {
        "00-AJ": {"status": "questionable", "note": "rts+src2 q 8.0/7.5 2026-10-05"},
        "00-TF": {"status": "active", "note": "manual: practiced fully"},
    }
    d = decide(existing)
    assert d["upserts"] == []
    assert {p["player_id"] for p in d["protected"]} == {"00-AJ", "00-TF"}


def test_same_status_own_row_is_already_not_rewritten():
    first = {u["player_id"]: u for u in decide()["upserts"]}
    existing = {pid: {"status": u["status"], "note": u["note"]} for pid, u in first.items()}
    d = decide(existing)
    assert d["upserts"] == []
    assert {a["player_id"] for a in d["already"]} == set(first)


def test_own_row_updates_when_fp_status_changes_and_never_downgrades_other_sources():
    existing = {"00-AJ": {"status": "doubtful", "note": "fp D 2026-10-01"}}
    d = decide(existing)
    aj = next(u for u in d["upserts"] if u["player_id"] == "00-AJ")
    assert aj["status"] == "out" and aj["old"] == "doubtful"


def test_own_row_no_longer_listed_is_reported_stale_not_cleared():
    existing = {"00-ZZ": {"status": "out", "note": "fp IR 2026-09-20"},
                "00-YY": {"status": "out", "note": "dk O"}}
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
    assert wrote == []
    assert r["written"] == 0 and r["upserts"]
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
