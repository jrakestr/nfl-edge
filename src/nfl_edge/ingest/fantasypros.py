"""FantasyPros v2 public API client. One explicit pull per call; fails closed.

The key travels only in the `x-api-key` header. It is never printed, logged, or put in an error
message. The free tier is limited: no polling, one retry on 5xx, and `calls` reports the count.
Docs: docs/vendor/fantasypros/. Nothing in sim/ or priors/ reads what this fetches.
"""
from __future__ import annotations

import json
import ssl
import time
from collections.abc import Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import certifi

from ..config import fantasypros_api_key

BASE_URL = "https://api.fantasypros.com/public/v2/json"
OFFENSE = "QB:RB:WR:TE"
_SSL = ssl.create_default_context(cafile=certifi.where())

Transport = Callable[[str, dict, str], tuple[int, dict]]


class FantasyProsError(RuntimeError):
    """Plain-language failure; nothing is written when this is raised."""


def _urlopen_transport(path: str, params: dict, key: str) -> tuple[int, dict]:
    url = f"{BASE_URL}{path}?{urlencode(params)}"
    req = Request(url, headers={"x-api-key": key})
    try:
        with urlopen(req, context=_SSL, timeout=60) as resp:
            body, status = resp.read(), resp.status
    except HTTPError as e:
        body, status = e.read(), e.code
    except URLError as e:
        raise FantasyProsError(f"FantasyPros unreachable ({type(e.reason).__name__})") from None
    try:
        return status, json.loads(body)
    except ValueError:
        if status == 200:
            raise FantasyProsError("FantasyPros returned a non-JSON body") from None
        return status, {}


class Client:
    def __init__(self, api_key: str | None = None, transport: Transport | None = None,
                 sleep: Callable[[float], None] = time.sleep):
        self._key = api_key or fantasypros_api_key()
        self._transport = transport or _urlopen_transport
        self._sleep = sleep
        self.calls = 0

    def _get(self, path: str, params: dict) -> dict:
        status, body = 0, {}
        for attempt in (1, 2):
            self.calls += 1
            status, body = self._transport(path, params, self._key)
            if status < 500 or attempt == 2:
                break
            self._sleep(2.0)
        if status != 200:
            raise FantasyProsError(f"FantasyPros {path} returned HTTP {status}; nothing written")
        return body

    @staticmethod
    def _check_week(body: dict, season: int, week: int, path: str) -> None:
        got_season, got_week = body.get("season"), body.get("week")
        if got_season is None or got_week is None or int(got_season) != season or int(got_week) != week:
            raise FantasyProsError(
                f"FantasyPros {path} answered season {got_season} week {got_week}, "
                f"asked season {season} week {week}; nothing written"
            )

    @staticmethod
    def _non_empty(body: dict, field: str, path: str) -> None:
        if not body.get(field):
            raise FantasyProsError(f"FantasyPros {path} returned no players ({field} empty); nothing written")

    def projections(self, season: int, week: int) -> dict:
        path = f"/nfl/{season}/projections"
        body = self._get(path, {"week": week, "positions": OFFENSE})
        self._check_week(body, season, week, path)
        self._non_empty(body, "players", path)
        return body

    def rankings(self, season: int, week: int) -> dict:
        path = f"/nfl/{season}/rankings"
        body = self._get(path, {"week": week})
        self._check_week(body, season, week, path)
        self._non_empty(body, "players", path)
        return body

    def injuries(self, season: int, week: int) -> dict:
        # include_probabilities adds the practice-report rows (practice 1-3, probability of playing)
        # for players with no injury status; the status importer skips those rows.
        path = "/nfl/injuries"
        body = self._get(path, {"year": season, "week": week, "include_probabilities": "true"})
        self._non_empty(body, "injuries", path)
        return body

    def player_points(self, season: int, start: int, end: int, scoring: str = "PPR") -> dict:
        path = f"/nfl/{season}/player-points"
        body = self._get(path, {"scoring": scoring, "start": start, "end": end,
                                "position": "ALL", "min": "false"})
        if str(body.get("season")) != str(season):
            raise FantasyProsError(f"FantasyPros {path} answered season {body.get('season')}, "
                                   f"asked season {season}; nothing written")
        if str(body.get("scoring")) != scoring:
            raise FantasyProsError(f"FantasyPros {path} answered scoring {body.get('scoring')}, "
                                   f"asked {scoring}; nothing written")
        self._non_empty(body, "players", path)
        return body

    def players(self) -> dict:
        path = "/nfl/players"
        body = self._get(path, {"external_ids": "draftkings"})
        self._non_empty(body, "players", path)
        return body
