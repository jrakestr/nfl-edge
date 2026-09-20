"""Spec for the DraftKings reference-line rule. Fail until market.reference exists."""
from __future__ import annotations

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from nfl_edge.market.reference import pick_close, pick_latest, qualifies

ET = ZoneInfo("America/New_York")
EFFECTIVE = datetime(2026, 9, 20, tzinfo=UTC)
WK1_KICK = datetime(2026, 9, 13, 13, 0, tzinfo=ET)
DET_BUF_KICK = datetime(2026, 9, 17, 20, 15, tzinfo=ET)
WK2_SUN_KICK = datetime(2026, 9, 20, 13, 0, tzinfo=ET)


def _row(
    snap_id: int,
    *,
    game_id: str = "2026_02_CAR_ATL",
    source: str = "odds_api",
    bookmaker: str = "draftkings",
    captured_at: datetime | None = None,
    spread: float | None = 3.0,
    total: float | None = 44.0,
) -> dict:
    return {
        "id": snap_id,
        "game_id": game_id,
        "source": source,
        "bookmaker": bookmaker,
        "captured_at": captured_at or datetime(2026, 9, 20, 2, 0, tzinfo=UTC),
        "spread_line": spread,
        "total_line": total,
    }


def test_qualifies_requires_dk_spread_and_total():
    assert qualifies(_row(1)) is True
    assert qualifies(_row(2, spread=None)) is False
    assert qualifies(_row(3, total=None)) is False
    assert qualifies(_row(4, spread=None, total=None)) is False
    assert qualifies(_row(5, bookmaker="fanduel")) is False
    assert qualifies(_row(6, source="nflverse", bookmaker=None)) is False


def test_dk_wins_when_complete_and_kickoff_after_effective_from():
    nfl = _row(10, source="nflverse", bookmaker=None, captured_at=datetime(2026, 9, 20, 3, 0, tzinfo=UTC))
    dk = _row(11, captured_at=datetime(2026, 9, 20, 2, 0, tzinfo=UTC))
    chosen = pick_latest([nfl, dk], WK2_SUN_KICK)
    assert chosen["id"] == 11


def test_h2h_only_dk_is_not_used_for_spread_total():
    nfl = _row(10, source="nflverse", bookmaker=None, spread=6.5, total=47.0)
    dk = _row(11, spread=None, total=None)
    chosen = pick_latest([nfl, dk], WK2_SUN_KICK)
    assert chosen["id"] == 10
    assert chosen["source"] == "nflverse"


def test_dk_missing_spread_falls_back_to_nflverse():
    nfl = _row(10, source="nflverse", bookmaker=None)
    dk = _row(11, spread=None, total=44.0)
    chosen = pick_latest([nfl, dk], WK2_SUN_KICK)
    assert chosen["id"] == 10


def test_week1_game_with_qualifying_dk_still_nflverse():
    nfl = _row(
        10,
        game_id="2026_01_CHI_CAR",
        source="nflverse",
        bookmaker=None,
        captured_at=datetime(2026, 9, 13, 4, 0, tzinfo=UTC),
    )
    dk = _row(
        11,
        game_id="2026_01_CHI_CAR",
        captured_at=datetime(2026, 9, 13, 4, 44, tzinfo=UTC),
        spread=3.5,
        total=43.5,
    )
    chosen = pick_latest([nfl, dk], WK1_KICK)
    assert chosen["id"] == 10
    assert chosen["source"] == "nflverse"


def test_det_buf_with_qualifying_dk_still_nflverse():
    nfl = _row(
        10,
        game_id="2026_02_DET_BUF",
        source="nflverse",
        bookmaker=None,
        captured_at=datetime(2026, 9, 17, 16, 0, tzinfo=UTC),
    )
    dk = _row(
        11,
        game_id="2026_02_DET_BUF",
        captured_at=datetime(2026, 9, 17, 16, 10, tzinfo=UTC),
        spread=7.5,
        total=51.0,
    )
    chosen = pick_latest([nfl, dk], DET_BUF_KICK)
    assert chosen["id"] == 10
    assert chosen["source"] == "nflverse"


def test_close_prefers_last_pre_kickoff_dk_after_effective_from():
    kick = WK2_SUN_KICK
    snaps = [
        _row(1, source="nflverse", bookmaker=None, captured_at=kick.replace(hour=10)),
        _row(2, captured_at=kick.replace(hour=11), spread=3.5, total=45.0),
        _row(3, captured_at=kick.replace(hour=12), spread=3.0, total=44.5),
        _row(4, captured_at=kick.replace(hour=15), spread=1.0, total=50.0),
    ]
    close = pick_close(snaps, kick)
    assert close["id"] == 3
    assert close["source"] == "odds_api"


def test_close_uses_nflverse_when_kickoff_before_effective_from():
    snaps = [
        _row(1, source="nflverse", bookmaker=None, captured_at=WK1_KICK.replace(hour=10), spread=6.5, total=47.0),
        _row(2, captured_at=WK1_KICK.replace(hour=11), spread=3.5, total=43.5),
    ]
    close = pick_close(snaps, WK1_KICK)
    assert close["id"] == 1
    assert close["source"] == "nflverse"


def test_close_ignores_post_kickoff_and_has_no_schedules_fallback():
    kick = WK2_SUN_KICK
    assert pick_close([_row(4, captured_at=kick.replace(hour=15))], kick) is None


def test_effective_from_is_2026_09_20_utc():
    from nfl_edge.config import line_reference

    cfg = line_reference()
    assert cfg["source"] == "odds_api"
    assert cfg["bookmaker"] == "draftkings"
    assert cfg["fallback_source"] == "nflverse"
    assert cfg["effective_from"] == EFFECTIVE


def test_line_reference_yaml_matches_table():
    from nfl_edge.config import line_reference
    from nfl_edge.db import read_sql

    cfg = line_reference()
    row = read_sql(
        "select source, bookmaker, fallback_source, effective_from from model.line_reference"
    ).row(0, named=True)
    assert row["source"] == cfg["source"]
    assert row["bookmaker"] == cfg["bookmaker"]
    assert row["fallback_source"] == cfg["fallback_source"]
    assert _aware_ts(row["effective_from"]) == cfg["effective_from"]


def _aware_ts(ts):
    if getattr(ts, "tzinfo", None) is None:
        return ts.replace(tzinfo=UTC)
    return ts


def test_view_week1_and_det_buf_are_nflverse():
    from nfl_edge.db import read_sql

    rows = read_sql(
        """
        select game_id, source, bookmaker
        from model.market_lines_latest
        where game_id like '2026_01_%' or game_id = '2026_02_DET_BUF'
        """
    )
    assert rows.height >= 17
    assert set(rows["source"].to_list()) == {"nflverse"}


def test_view_open_week2_sunday_is_draftkings():
    from nfl_edge.db import read_sql

    row = read_sql(
        """
        select source, bookmaker, spread_line, total_line
        from model.market_lines_latest
        where game_id = '2026_02_CAR_ATL'
        """
    ).row(0, named=True)
    assert row["source"] == "odds_api"
    assert row["bookmaker"] == "draftkings"
    assert row["spread_line"] is not None
    assert row["total_line"] is not None
