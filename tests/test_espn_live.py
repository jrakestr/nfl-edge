"""ESPN scoreboard and box-score parsing. No network."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from nfl_edge.ingest import espn_live as E

NOW = datetime(2026, 10, 19, 1, 0, tzinfo=UTC)


def _status(state: str, period: int, clock: float, name: str) -> dict:
    return {"period": period, "clock": clock, "displayClock": "0:00",
            "type": {"state": state, "name": name}}


def _event(eid: str, state: str, home: str, away: str, period: int = 1, clock: float = 900) -> dict:
    return {
        "id": eid,
        "status": _status(state, period, clock, state),
        "competitions": [{
            "competitors": [
                {"homeAway": "home", "score": "10", "team": {"abbreviation": home, "id": "1"}},
                {"homeAway": "away", "score": "7", "team": {"abbreviation": away, "id": "2"}},
            ],
        }],
    }


def _board(*events: dict) -> dict:
    return {"season": {"year": 2026}, "week": {"number": 6}, "events": list(events)}


def test_secs_remaining_regulation_ot_final_pending():
    assert E.secs_remaining("pending", 0, 0) == 3600
    assert E.secs_remaining("final", 4, 0) == 0
    assert E.secs_remaining("live", 1, 900) == 3600
    assert E.secs_remaining("live", 1, 313) == 3600 - (900 - 313)
    assert E.secs_remaining("live", 2, 0) == 1800
    assert E.secs_remaining("live", 5, 480) == 480
    assert E.secs_remaining("live", 4, 0) == 0


def test_scoreboard_aliases_washington_and_maps_state():
    games = E.parse_scoreboard(_board(_event("9", "pre", "SF", "WSH", period=0, clock=0)))
    assert games[0]["away"] == "WAS"
    assert games[0]["state"] == "pending"
    assert games[0]["secs_remaining"] == 3600
    live = E.parse_scoreboard(_board(_event("8", "in", "KC", "LV", period=2, clock=0)))
    assert live[0]["state"] == "live" and live[0]["secs_remaining"] == 1800


def test_box_maps_skill_stats_and_names_unmapped():
    summary = {"boxscore": {"players": [_side()]}}
    rows, unmapped = E.parse_box(summary, {"4432577": "00-0039163"})
    assert unmapped == []
    assert rows["00-0039163"]["passing_yards"] == 312
    assert rows["00-0039163"]["passing_tds"] == 3
    assert rows["00-0039163"]["rushing_yards"] == 10
    rows, unmapped = E.parse_box(summary, {})
    assert unmapped == ["C.J. Stroud (4432577)"]
    assert rows == {}


def test_core_team_has_sacks_safeties_and_blocks():
    stats = E.parse_core_team(_core())
    assert stats["def_sacks"] == 3
    assert stats["def_safeties"] == 1
    assert stats["def_fg_blocks"] == 2
    assert stats["fumble_recovery_opp"] == 1
    assert stats["def_tds"] == 1
    assert stats["special_teams_tds"] == 1


def test_core_missing_safety_stops():
    payload = _core()
    stats = payload["splits"]["categories"]
    defensive = next(c for c in stats if c["name"] == "defensive")
    defensive["stats"] = [s for s in defensive["stats"] if s["name"] != "safeties"]
    with pytest.raises(E.SchemaError, match="safeties"):
        E.parse_core_team(payload)


def test_needs_box_live_and_recent_final_only():
    assert E.needs_box("live", None, NOW) is True
    assert E.needs_box("pending", None, NOW) is False
    assert E.needs_box("final", None, NOW) is True
    recent = {"state": "final", "fetched_at": NOW - timedelta(minutes=30)}
    old = {"state": "final", "fetched_at": NOW - timedelta(hours=2)}
    assert E.needs_box("final", recent, NOW) is True
    assert E.needs_box("final", old, NOW) is False


def test_unmapped_player_does_not_write(monkeypatch):
    written = []
    monkeypatch.setattr(E, "persist_snapshot", lambda *a, **k: written.append("x"))
    monkeypatch.setattr(E, "mark_stale", lambda *a, **k: written.append("stale"))
    monkeypatch.setattr(E, "_existing", lambda s, w: {})
    monkeypatch.setattr(E, "_espn_map", dict)
    board = _board(_event("8", "in", "HOU", "JAX"))

    def fetch(url: str) -> dict:
        if "scoreboard" in url:
            return board
        if "summary" in url:
            return {"boxscore": {"players": [_side(), _side()]}}
        return _core()

    report = E.run(2026, 6, fetch=fetch, now=NOW)
    assert written == ["stale"]
    assert "C.J. Stroud" in report["skipped"][0]["error"]
    assert report["written"] == []


def test_in_game_window_sunday_and_monday_night():
    sunday = datetime(2026, 10, 18, 17, 0, tzinfo=E.ET)  # 17:00 ET Sunday
    monday_early = datetime(2026, 10, 19, 12, 0, tzinfo=E.ET)
    monday_night = datetime(2026, 10, 19, 20, 0, tzinfo=E.ET)
    assert E.in_game_window(sunday) is True
    assert E.in_game_window(monday_early) is False
    assert E.in_game_window(monday_night) is True


def _athlete(eid: str, name: str, stats: list[str]) -> dict:
    return {"athlete": {"id": eid, "displayName": name}, "stats": stats}


def _group(name: str, keys: list[str], athletes: list[dict]) -> dict:
    return {"name": name, "keys": keys, "athletes": athletes}


def _side() -> dict:
    passer = _athlete("4432577", "C.J. Stroud", ["24/34", "312", "9.2", "3", "1", "0-0", "95", "116"])
    rusher = _athlete("4432577", "C.J. Stroud", ["2", "10", "5", "0", "8"])
    empty = _group
    return {"statistics": [
        _group("passing", ["completions/passingAttempts", "passingYards", "yardsPerPassAttempt",
                           "passingTouchdowns", "interceptions", "sacks-sackYardsLost", "adjQBR",
                           "QBRating"], [passer]),
        _group("rushing", ["rushingAttempts", "rushingYards", "yardsPerRushAttempt",
                           "rushingTouchdowns", "longRushing"], [rusher]),
        empty("receiving", ["receptions", "receivingYards", "yardsPerReception",
                            "receivingTouchdowns", "longReception", "receivingTargets"], []),
        empty("fumbles", ["fumbles", "fumblesLost", "fumblesRecovered"], []),
        empty("kickReturns", ["kickReturns", "kickReturnYards", "yardsPerKickReturn",
                              "longKickReturn", "kickReturnTouchdowns"], []),
        empty("puntReturns", ["puntReturns", "puntReturnYards", "yardsPerPuntReturn",
                              "longPuntReturn", "puntReturnTouchdowns"], []),
    ]}


def _cat(name: str, pairs: dict) -> dict:
    return {"name": name, "stats": [{"name": k, "value": v} for k, v in pairs.items()]}


def _core() -> dict:
    return {"splits": {"categories": [
        _cat("defensive", {
            "sacks": 3, "safeties": 1, "kicksBlocked": 2, "defensiveTouchdowns": 1,
            "blockedFieldGoalTouchdowns": 0, "blockedPuntTouchdowns": 0,
            "missedFieldGoalReturnTd": 0,
        }),
        _cat("defensiveInterceptions", {"interceptions": 1}),
        _cat("returning", {
            "oppFumbleRecoveries": 1, "kickReturnTouchdowns": 1, "puntReturnTouchdowns": 0,
        }),
    ]}}
