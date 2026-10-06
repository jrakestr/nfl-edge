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
        path = "/nfl/injuries"
        body = self._get(path, {"year": season, "week": week})
        self._non_empty(body, "injuries", path)
        return body

    def players(self) -> dict:
        path = "/nfl/players"
        body = self._get(path, {"external_ids": "draftkings"})
        self._non_empty(body, "players", path)
        return body
