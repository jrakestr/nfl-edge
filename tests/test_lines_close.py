from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from nfl_edge.outputs.lines_io import apply_close_snapshots

ET = ZoneInfo("America/New_York")
GID = "2026_01_DET_NO"


def _game(**kw):
    row = {
        "game_id": GID,
        "gameday": date(2026, 9, 13),
        "gametime": "13:00",
        "location": "Home",
        "market_line_id": 99,
        "captured_at": "post-game",
        "spread_line": 10.0,
        "total_line": 50.0,
        "home_spread_odds": -110,
        "away_spread_odds": -110,
        "over_odds": -110,
        "under_odds": -110,
        "home_moneyline": -400,
        "away_moneyline": 320,
    }
    row.update(kw)
    return row


def _snap(i, captured_at, spread=7.0, total=44.5):
    return {
        "id": i, "game_id": GID, "captured_at": captured_at,
        "spread_line": spread, "total_line": total,
        "home_spread_odds": -108, "away_spread_odds": -112,
        "over_odds": -110, "under_odds": -110,
        "home_moneyline": -380, "away_moneyline": 300,
    }


def test_apply_close_uses_last_pre_kickoff():
    kick = datetime(2026, 9, 13, 13, 0, tzinfo=ET)
    snaps = [
        _snap(1, kick - timedelta(days=1), spread=6.5),
        _snap(2, kick - timedelta(hours=1), spread=7.5, total=45.0),
        _snap(3, kick + timedelta(hours=2), spread=3.0, total=60.0),
    ]
    out = apply_close_snapshots([_game()], snaps)
    assert out[0]["market_line_id"] == 2
    assert out[0]["spread_line"] == 7.5
    assert out[0]["total_line"] == 45.0


def test_apply_close_strips_when_only_post_kickoff():
    kick = datetime(2026, 9, 13, 13, 0, tzinfo=ET)
    out = apply_close_snapshots([_game()], [_snap(3, kick + timedelta(hours=1))])
    assert out[0]["market_line_id"] is None
    assert out[0]["spread_line"] is None
    assert out[0]["total_line"] is None
    assert out[0]["captured_at"] is None


def test_apply_close_does_not_use_schedules_fallback():
    """No pre-kickoff nflverse row → leave ungraded, even if the schedule still has a line."""
    out = apply_close_snapshots([_game()], [])
    assert out[0]["market_line_id"] is None
    assert out[0]["spread_line"] is None
