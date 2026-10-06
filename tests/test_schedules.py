import polars as pl
import pytest

from nfl_edge.ingest import schedules


def _row(**kw) -> dict:
    base = {
        "game_id": "2026_01_NE_SEA", "season": 2026, "game_type": "REG", "week": 1,
        "gameday": None, "weekday": "Thursday", "gametime": "20:20",
        "away_team": "NE", "home_team": "SEA",
        "away_score": None, "home_score": None, "result": None, "total": None, "overtime": None,
        "spread_line": 3.0, "total_line": 44.5, "location": "Home", "stadium": "Lumen",
        "home_qb_id": None, "away_qb_id": None,
    }
    base.update(kw)
    return base


@pytest.mark.network
def test_fetch_2026_has_lines():
    df = schedules.fetch([2026])
    wk1 = df.filter(pl.col("week") == 1)
    assert wk1.height >= 16
    assert wk1["spread_line"].null_count() == 0
    assert wk1["total_line"].null_count() == 0


def test_schedule_writes_inserts_new_game():
    incoming = pl.DataFrame([_row()])
    existing = pl.DataFrame(schema=incoming.schema)
    ins, upd = schedules.schedule_writes(incoming, existing, lines_only=True)
    assert ins["game_id"].to_list() == ["2026_01_NE_SEA"]
    assert upd.is_empty()


def test_schedule_writes_updates_scores_not_lines():
    incoming = pl.DataFrame([_row(away_score=20, home_score=17, result=-3, total=37, overtime=0,
                                  spread_line=2.5, total_line=43.5)])
    existing = pl.DataFrame([_row()])
    ins, upd = schedules.schedule_writes(incoming, existing, lines_only=True)
    assert ins.is_empty()
    assert upd.height == 1
    assert set(upd.columns) == {"game_id", *schedules.RESULT_COLS}
    assert upd.row(0, named=True)["total"] == 37
    assert "total_line" not in upd.columns
    assert "spread_line" not in upd.columns


def test_schedule_writes_skips_unchanged_results():
    row = _row(away_score=20, home_score=17, result=-3, total=37, overtime=0)
    incoming = pl.DataFrame([row])
    existing = pl.DataFrame([row])
    ins, upd = schedules.schedule_writes(incoming, existing, lines_only=True)
    assert ins.is_empty() and upd.is_empty()


def test_pad_update_adds_identity_not_lines():
    incoming = pl.DataFrame([_row(away_score=20, home_score=17, result=-3, total=37, overtime=0)])
    existing = pl.DataFrame([_row()])
    _, upd = schedules.schedule_writes(incoming, existing, lines_only=True)
    padded = schedules.pad_update_for_upsert(upd, existing)
    assert set(schedules.IDENTITY_COLS) <= set(padded.columns)
    assert padded["season"][0] == 2026
    assert padded["away_team"][0] == "NE"
    assert "spread_line" not in padded.columns
    assert "total_line" not in padded.columns


def test_schedule_writes_full_ingest_does_not_touch_frozen_or_lines():
    incoming = pl.DataFrame([_row(home_qb_id="00-new", spread_line=1.0, total_line=50.0,
                                  away_score=20, home_score=17, result=-3, total=37, overtime=0)])
    existing = pl.DataFrame([_row()])
    ins, upd = schedules.schedule_writes(incoming, existing, lines_only=False)
    assert ins.is_empty()
    assert "home_qb_id" in upd.columns
    assert "spread_line" not in upd.columns
    assert "total_line" not in upd.columns
    assert "gameday" not in upd.columns
    assert "location" not in upd.columns
