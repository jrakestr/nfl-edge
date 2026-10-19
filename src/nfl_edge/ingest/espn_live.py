"""ESPN public scoreboard and box score into raw.live_* (latest snapshot only).

Display and grading only. Not a sim input. No API key. The site summary box score
has skill-player stats, sacks, and defensive touchdowns. It does not have safeties
or blocked kicks. Those come from the core team-statistics endpoint, same public
host, and are stored under the keys dst_line already reads.

One scoreboard pull per run. A box score is fetched only for a live game, a final
game we have never stored, or a final snapshot newer than an hour. A failed game
keeps its last good rows and is marked stale. An unmapped stat-bearing skill
player blocks that game's write and is named.
"""
from __future__ import annotations

import json
import ssl
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

import certifi
import polars as pl

from ..db import _stage, conn, execute, read_sql
from .names import TEAM_ALIASES

_SSL = ssl.create_default_context(cafile=certifi.where())
ET = ZoneInfo("America/New_York")
SCOREBOARD = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
SUMMARY = "https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event={eid}"
CORE = (
    "https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/"
    "{eid}/competitions/{eid}/competitors/{tid}/statistics"
)
UA = "nfl-edge"
HOUR = timedelta(hours=1)
REG_QUARTER = 900
REG_SECS = 3600

SKILL_GROUPS = ("passing", "rushing", "receiving", "fumbles", "kickReturns", "puntReturns")
CORE_NEED = {
    "defensive": (
        "sacks", "safeties", "kicksBlocked", "defensiveTouchdowns",
        "blockedFieldGoalTouchdowns", "blockedPuntTouchdowns", "missedFieldGoalReturnTd",
    ),
    "defensiveInterceptions": ("interceptions",),
    "returning": ("oppFumbleRecoveries", "kickReturnTouchdowns", "puntReturnTouchdowns"),
}
BEARING = (
    "passing_yards", "passing_tds", "passing_interceptions", "rushing_yards", "rushing_tds",
    "receptions", "receiving_yards", "receiving_tds", "rushing_fumbles_lost", "special_teams_tds",
)
_STATE = {"pre": "pending", "in": "live", "post": "final"}


class SchemaError(Exception):
    """ESPN payload is missing a field the scorer needs. The game is not written."""


def team_code(abbr: str) -> str:
    code = (abbr or "").upper()
    return TEAM_ALIASES.get(code, code)


def secs_remaining(state: str, period: int, clock_sec: int) -> int:
    """Game clock left, not player snaps. Final is 0. Pending is 60 minutes.
    Overtime returns the OT clock. Regulation is 60 minutes minus time elapsed."""
    if state == "final":
        return 0
    if state == "pending" or period <= 0:
        return REG_SECS
    clock = max(0, int(clock_sec))
    if period >= 5:
        return clock
    elapsed = (int(period) - 1) * REG_QUARTER + (REG_QUARTER - min(clock, REG_QUARTER))
    return max(0, REG_SECS - elapsed)


def in_game_window(now: datetime) -> bool:
    """Thu/Mon from 19:00 ET, Sunday from 12:00 ET. An hour before the 20:15 kickoffs."""
    et = now.astimezone(ET)
    if et.weekday() == 6 and et.hour >= 12:
        return True
    return et.weekday() in (0, 3) and et.hour >= 19


def _clock_sec(status: dict) -> int:
    clock = status.get("clock")
    if isinstance(clock, (int, float)):
        return int(clock)
    text = str(status.get("displayClock") or "0:00")
    if ":" not in text:
        raise SchemaError(f"bad clock {text!r}")
    mins, secs = text.split(":", 1)
    return int(mins) * 60 + int(secs)


def _num(text: Any) -> float:
    if text is None or text == "":
        return 0.0
    if isinstance(text, (int, float)):
        return float(text)
    raw = str(text).replace(",", "").strip()
    if "-" in raw and not raw.startswith("-"):
        raw = raw.split("-", 1)[0]
    return float(raw)


def _indexed(keys: list, stats: list, name: str, group: str) -> float:
    if name not in keys:
        raise SchemaError(f"{group} missing {name}")
    return _num(stats[keys.index(name)])


def parse_scoreboard(payload: dict) -> list[dict]:
    """One dict per event. Team codes already aliased (WSH -> WAS)."""
    try:
        season = int(payload["season"]["year"])
        week = int(payload["week"]["number"])
    except (KeyError, TypeError) as e:
        raise SchemaError(f"scoreboard missing season/week: {e}") from e
    out: list[dict] = []
    for event in payload.get("events") or []:
        try:
            status = event["status"]
            raw_state = status["type"]["state"]
            comp = event["competitions"][0]
            eid = str(event["id"])
        except (KeyError, IndexError, TypeError) as e:
            raise SchemaError(f"scoreboard event missing fields: {e}") from e
        if raw_state not in _STATE:
            raise SchemaError(f"event {eid} unknown state {raw_state!r}")
        state = _STATE[raw_state]
        period = int(status.get("period") or 0)
        clock = _clock_sec(status)
        home = away = None
        home_score = away_score = None
        sides: list[dict] = []
        for comp_team in comp.get("competitors") or []:
            try:
                abbr = team_code(comp_team["team"]["abbreviation"])
                tid = str(comp_team["team"]["id"])
                is_home = comp_team["homeAway"] == "home"
            except (KeyError, TypeError) as e:
                raise SchemaError(f"event {eid} competitor: {e}") from e
            score_raw = comp_team.get("score")
            score = None if score_raw in (None, "") else int(score_raw)
            sides.append({"abbr": abbr, "espn_id": tid, "home": is_home})
            if is_home:
                home, home_score = abbr, score
            else:
                away, away_score = abbr, score
        if not home or not away:
            raise SchemaError(f"event {eid} missing home or away")
        out.append({
            "espn_event_id": eid,
            "season": season,
            "week": week,
            "home": home,
            "away": away,
            "state": state,
            "period": period,
            "clock_sec": clock,
            "secs_remaining": secs_remaining(state, period, clock),
            "home_score": home_score,
            "away_score": away_score,
            "stale": False,
            "sides": sides,
        })
    return out


def _blank() -> dict[str, float]:
    return {
        "passing_yards": 0.0, "passing_tds": 0.0, "passing_interceptions": 0.0,
        "rushing_yards": 0.0, "rushing_tds": 0.0, "receptions": 0.0,
        "receiving_yards": 0.0, "receiving_tds": 0.0, "rushing_fumbles_lost": 0.0,
        "receiving_fumbles_lost": 0.0, "sack_fumbles_lost": 0.0,
        "passing_2pt_conversions": 0.0, "rushing_2pt_conversions": 0.0,
        "receiving_2pt_conversions": 0.0, "special_teams_tds": 0.0, "fumble_recovery_tds": 0.0,
    }


def parse_box(summary: dict, espn_to_gsis: dict[str, str]) -> tuple[dict[str, dict], list[str]]:
    """Skill rows keyed by gsis id, plus names of stat-bearing players with no gsis id.

    Two-point conversions are not on this feed. They stay 0 until nflverse replaces the row.
    """
    try:
        sides = summary["boxscore"]["players"]
    except (KeyError, TypeError) as e:
        raise SchemaError(f"summary missing boxscore.players: {e}") from e
    merged: dict[str, dict] = {}
    names: dict[str, str] = {}
    for side in sides:
        groups = {g.get("name"): g for g in (side.get("statistics") or [])}
        missing = [n for n in SKILL_GROUPS if n not in groups]
        if missing:
            raise SchemaError(f"box score missing groups {missing}")
        for group_name in SKILL_GROUPS:
            group = groups[group_name]
            keys = list(group.get("keys") or [])
            for athlete in group.get("athletes") or []:
                eid = str((athlete.get("athlete") or {}).get("id") or "")
                label = (athlete.get("athlete") or {}).get("displayName") or eid
                stats = list(athlete.get("stats") or [])
                if not eid:
                    raise SchemaError(f"{group_name} athlete has no id")
                row = merged.setdefault(eid, _blank())
                names[eid] = label
                if group_name == "passing":
                    row["passing_yards"] += _indexed(keys, stats, "passingYards", group_name)
                    row["passing_tds"] += _indexed(keys, stats, "passingTouchdowns", group_name)
                    row["passing_interceptions"] += _indexed(keys, stats, "interceptions", group_name)
                elif group_name == "rushing":
                    row["rushing_yards"] += _indexed(keys, stats, "rushingYards", group_name)
                    row["rushing_tds"] += _indexed(keys, stats, "rushingTouchdowns", group_name)
                elif group_name == "receiving":
                    row["receptions"] += _indexed(keys, stats, "receptions", group_name)
                    row["receiving_yards"] += _indexed(keys, stats, "receivingYards", group_name)
                    row["receiving_tds"] += _indexed(keys, stats, "receivingTouchdowns", group_name)
                elif group_name == "fumbles":
                    row["rushing_fumbles_lost"] += _indexed(keys, stats, "fumblesLost", group_name)
                elif group_name == "kickReturns":
                    row["special_teams_tds"] += _indexed(keys, stats, "kickReturnTouchdowns", group_name)
                else:
                    row["special_teams_tds"] += _indexed(keys, stats, "puntReturnTouchdowns", group_name)
    by_gsis: dict[str, dict] = {}
    unmapped: list[str] = []
    for eid, stats in merged.items():
        if not any(stats.get(k) for k in BEARING):
            continue
        gsis = espn_to_gsis.get(eid)
        if not gsis:
            unmapped.append(f"{names.get(eid, eid)} ({eid})")
            continue
        by_gsis[gsis] = stats
    return by_gsis, unmapped


def _categories(payload: dict) -> dict[str, dict[str, float]]:
    try:
        cats = payload["splits"]["categories"]
    except (KeyError, TypeError) as e:
        raise SchemaError(f"core stats missing splits.categories: {e}") from e
    out: dict[str, dict[str, float]] = {}
    for cat in cats:
        name = cat.get("name")
        if not name:
            continue
        out[name] = {s.get("name"): _num(s.get("value")) for s in (cat.get("stats") or [])}
    return out


def parse_core_team(payload: dict) -> dict[str, float]:
    """DST inputs. kicksBlocked is the defense's blocked kicks, stored on def_fg_blocks."""
    cats = _categories(payload)
    picked: dict[str, dict[str, float]] = {}
    for cat, keys in CORE_NEED.items():
        if cat not in cats:
            raise SchemaError(f"core stats missing category {cat}")
        missing = [k for k in keys if k not in cats[cat]]
        if missing:
            raise SchemaError(f"core {cat} missing {missing}")
        picked[cat] = cats[cat]
    d, di, r = picked["defensive"], picked["defensiveInterceptions"], picked["returning"]
    st_td = (
        r["kickReturnTouchdowns"] + r["puntReturnTouchdowns"]
        + d["blockedFieldGoalTouchdowns"] + d["blockedPuntTouchdowns"]
        + d["missedFieldGoalReturnTd"]
    )
    return {
        "def_sacks": d["sacks"],
        "def_interceptions": di["interceptions"],
        "fumble_recovery_opp": r["oppFumbleRecoveries"],
        "def_tds": d["defensiveTouchdowns"],
        "special_teams_tds": st_td,
        "def_safeties": d["safeties"],
        "def_fg_blocks": d["kicksBlocked"],
        "def_pat_blocks": 0.0,
        "def_punt_blocks": 0.0,
    }


def needs_box(state: str, prev: dict | None, now: datetime) -> bool:
    """Live always. Final when we have no final snapshot yet, or that snapshot is under an hour old."""
    if state == "live":
        return True
    if state != "final":
        return False
    if prev is None or prev.get("state") != "final":
        return True
    fetched = prev.get("fetched_at")
    if fetched is None:
        return True
    if fetched.tzinfo is None:
        fetched = fetched.replace(tzinfo=UTC)
    return now - fetched <= HOUR


def should_pull(games: list[dict], existing: dict[str, dict], now: datetime) -> bool:
    """True when any game is live or its final box is still due."""
    return any(needs_box(g["state"], existing.get(g["espn_event_id"]), now) for g in games)


def fetch_json(url: str) -> dict:
    req = Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urlopen(req, context=_SSL, timeout=30) as resp:
            return json.load(resp)
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as e:
        raise ConnectionError(type(e).__name__) from e


def _espn_map() -> dict[str, str]:
    df = read_sql(
        "select espn_id, gsis_id from raw.players where espn_id is not null and gsis_id is not null"
    )
    return {str(r["espn_id"]): str(r["gsis_id"]) for r in df.to_dicts()}


def _existing(season: int, week: int) -> dict[str, dict]:
    df = read_sql(
        "select espn_event_id, state, fetched_at from raw.live_games where season = %s and week = %s",
        (season, week),
    )
    return {str(r["espn_event_id"]): r for r in df.to_dicts()}


def mark_stale(season: int, week: int, espn_event_id: str | None = None) -> None:
    if espn_event_id is None:
        execute(
            "update raw.live_games set stale = true where season = %s and week = %s",
            (season, week),
        )
        return
    execute(
        "update raw.live_games set stale = true where season = %s and week = %s and espn_event_id = %s",
        (season, week, espn_event_id),
    )


def _game_row(game: dict, now: datetime) -> dict:
    return {
        "season": game["season"],
        "week": game["week"],
        "espn_event_id": game["espn_event_id"],
        "game_id": None,
        "home": game["home"],
        "away": game["away"],
        "state": game["state"],
        "period": game["period"],
        "clock_sec": game["clock_sec"],
        "secs_remaining": game["secs_remaining"],
        "home_score": game["home_score"],
        "away_score": game["away_score"],
        "stale": False,
        "fetched_at": now,
    }


def persist_snapshot(game: dict, players: dict[str, dict], teams: dict[str, dict], now: datetime) -> None:
    """Replace this game's player and team rows and upsert the game, in one transaction."""
    season, week, eid = game["season"], game["week"], game["espn_event_id"]
    player_rows = [
        {"season": season, "week": week, "espn_event_id": eid, "player_id": pid, "stats": stats}
        for pid, stats in players.items()
    ]
    team_rows = [
        {"season": season, "week": week, "espn_event_id": eid, "team": team, "stats": stats}
        for team, stats in teams.items()
    ]
    players_df = pl.DataFrame(player_rows) if player_rows else pl.DataFrame()
    teams_df = pl.DataFrame(team_rows) if team_rows else pl.DataFrame()
    game_df = _game_frame(game, now)
    with conn() as c, c.cursor() as cur:
        cur.execute(
            "delete from raw.live_player_stats where season = %s and week = %s and espn_event_id = %s",
            (season, week, eid),
        )
        cur.execute(
            "delete from raw.live_team_stats where season = %s and week = %s and espn_event_id = %s",
            (season, week, eid),
        )
        for df, table in (
            (players_df, "raw.live_player_stats"),
            (teams_df, "raw.live_team_stats"),
        ):
            if df.is_empty():
                continue
            stg = _stage(cur, df, table)
            cols = ",".join(df.columns)
            cur.execute(f"insert into {table} ({cols}) select {cols} from {stg}")
        stg = _stage(cur, game_df, "raw.live_games")
        cols = ",".join(game_df.columns)
        keys = ("season", "week", "espn_event_id")
        sets = ",".join(f"{c}=excluded.{c}" for c in game_df.columns if c not in keys)
        cur.execute(
            f"insert into raw.live_games ({cols}) select {cols} from {stg} "
            f"on conflict (season, week, espn_event_id) do update set {sets}"
        )
        c.commit()


_GAME_SCHEMA = {
    "season": pl.Int64, "week": pl.Int64, "espn_event_id": pl.Utf8, "game_id": pl.Utf8,
    "home": pl.Utf8, "away": pl.Utf8, "state": pl.Utf8, "period": pl.Int64,
    "clock_sec": pl.Int64, "secs_remaining": pl.Int64, "home_score": pl.Int64,
    "away_score": pl.Int64, "stale": pl.Boolean, "fetched_at": pl.Datetime(time_zone="UTC"),
}


def _game_frame(game: dict, now: datetime) -> pl.DataFrame:
    return pl.DataFrame([_game_row(game, now)], schema=_GAME_SCHEMA)


def upsert_game(game: dict, now: datetime) -> None:
    """Scoreboard-only update. Does not touch player or team stat rows."""
    from ..db import upsert

    upsert(_game_frame(game, now), "raw.live_games", ["season", "week", "espn_event_id"])


def _pull_box(game: dict, fetch: Callable[[str], dict], espn_to_gsis: dict[str, str]
              ) -> tuple[dict[str, dict], dict[str, dict]]:
    summary = fetch(SUMMARY.format(eid=game["espn_event_id"]))
    players, unmapped = parse_box(summary, espn_to_gsis)
    if unmapped:
        raise SchemaError("unmapped " + ", ".join(sorted(unmapped)))
    teams: dict[str, dict] = {}
    for side in game["sides"]:
        core = fetch(CORE.format(eid=game["espn_event_id"], tid=side["espn_id"]))
        teams[side["abbr"]] = parse_core_team(core)
    if len(teams) < 2:
        raise SchemaError(f"event {game['espn_event_id']} has {len(teams)} team stat rows")
    return players, teams


def run(season: int, week: int, *, fetch: Callable[[str], dict] = fetch_json,
        now: datetime | None = None) -> dict:
    """Pull the scoreboard. Box scores only where needs_box is true. One transaction per game."""
    now = now or datetime.now(UTC)
    try:
        board = fetch(SCOREBOARD)
    except (ConnectionError, SchemaError) as e:
        mark_stale(season, week)
        return {"ok": False, "stale": True, "error": str(e), "written": [], "skipped": []}
    try:
        games = [g for g in parse_scoreboard(board) if g["season"] == season and g["week"] == week]
    except SchemaError as e:
        mark_stale(season, week)
        return {"ok": False, "stale": True, "error": str(e), "written": [], "skipped": []}
    existing = _existing(season, week)
    espn_to_gsis = _espn_map()
    written: list[str] = []
    skipped: list[dict] = []
    for game in games:
        if not needs_box(game["state"], existing.get(game["espn_event_id"]), now):
            upsert_game(game, now)
            continue
        try:
            players, teams = _pull_box(game, fetch, espn_to_gsis)
            persist_snapshot(game, players, teams, now)
            written.append(game["espn_event_id"])
        except (ConnectionError, SchemaError) as e:
            mark_stale(season, week, game["espn_event_id"])
            skipped.append({"espn_event_id": game["espn_event_id"], "error": str(e)})
    return {"ok": True, "stale": False, "error": None, "written": written, "skipped": skipped,
            "games": len(games)}


__all__ = [
    "SchemaError", "in_game_window", "needs_box", "parse_box", "parse_core_team",
    "parse_scoreboard", "run", "secs_remaining", "should_pull", "team_code",
]
