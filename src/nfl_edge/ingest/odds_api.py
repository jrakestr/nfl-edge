"""One-shot The Odds API pull → raw.market_lines (source='odds_api')."""
from __future__ import annotations

import json
import ssl
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

import certifi
import polars as pl

from ..config import odds_api_key
from ..db import insert_ignore, read_sql

ODDS_URL = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/"
_SSL = ssl.create_default_context(cafile=certifi.where())
SOURCE = "odds_api"
RECENT_MINUTES = 15
ET = ZoneInfo("America/New_York")

TEAM_NAMES = {
    "Arizona Cardinals": "ARI",
    "Atlanta Falcons": "ATL",
    "Baltimore Ravens": "BAL",
    "Buffalo Bills": "BUF",
    "Carolina Panthers": "CAR",
    "Chicago Bears": "CHI",
    "Cincinnati Bengals": "CIN",
    "Cleveland Browns": "CLE",
    "Dallas Cowboys": "DAL",
    "Denver Broncos": "DEN",
    "Detroit Lions": "DET",
    "Green Bay Packers": "GB",
    "Houston Texans": "HOU",
    "Indianapolis Colts": "IND",
    "Jacksonville Jaguars": "JAX",
    "Kansas City Chiefs": "KC",
    "Las Vegas Raiders": "LV",
    "Los Angeles Chargers": "LAC",
    "Los Angeles Rams": "LA",
    "Miami Dolphins": "MIA",
    "Minnesota Vikings": "MIN",
    "New England Patriots": "NE",
    "New Orleans Saints": "NO",
    "New York Giants": "NYG",
    "New York Jets": "NYJ",
    "Philadelphia Eagles": "PHI",
    "Pittsburgh Steelers": "PIT",
    "San Francisco 49ers": "SF",
    "Seattle Seahawks": "SEA",
    "Tampa Bay Buccaneers": "TB",
    "Tennessee Titans": "TEN",
    "Washington Commanders": "WAS",
}

ROW_COLS = [
    "game_id", "captured_at", "source", "bookmaker", "fetched_at",
    "spread_line", "total_line", "away_moneyline", "home_moneyline",
    "away_spread_odds", "home_spread_odds", "over_odds", "under_odds",
]


class UnmappedTeam(RuntimeError):
    def __init__(self, name: str):
        super().__init__(f"unmapped Odds API team name: {name!r}")


class RecentDuplicate(RuntimeError):
    def __init__(self, n: int):
        self.n = n
        super().__init__(
            f"odds_api: {n} recent duplicate rows "
            f"(same game, book, captured_at within {RECENT_MINUTES}m); pass --force to insert"
        )


class ZeroMatch(RuntimeError):
    def __init__(self, skipped: list[dict]):
        self.skipped = skipped
        super().__init__("Odds API: zero events matched raw.schedules")


@dataclass
class ParseResult:
    rows: pl.DataFrame
    skipped: list[dict]
    n_matched: int


def map_team(name: str) -> str:
    abbr = TEAM_NAMES.get(name)
    if abbr is None:
        raise UnmappedTeam(name)
    return abbr


def et_date(commence_time: str) -> date:
    ts = datetime.fromisoformat(commence_time)
    return ts.astimezone(ET).date()


def _parse_ts(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _as_date(v) -> date:
    if isinstance(v, datetime):
        return v.date()
    if hasattr(v, "year") and hasattr(v, "month"):
        return v
    return datetime.fromisoformat(str(v)[:10]).date()


def _empty_rows() -> pl.DataFrame:
    return pl.DataFrame(schema={
        "game_id": pl.Utf8,
        "captured_at": pl.Datetime(time_zone="UTC"),
        "source": pl.Utf8,
        "bookmaker": pl.Utf8,
        "fetched_at": pl.Datetime(time_zone="UTC"),
        "spread_line": pl.Float64,
        "total_line": pl.Float64,
        "away_moneyline": pl.Int64,
        "home_moneyline": pl.Int64,
        "away_spread_odds": pl.Int64,
        "home_spread_odds": pl.Int64,
        "over_odds": pl.Int64,
        "under_odds": pl.Int64,
    })


def _lookup(schedules: pl.DataFrame) -> dict[tuple, list[str]]:
    out: dict[tuple, list[str]] = {}
    if schedules.is_empty():
        return out
    for r in schedules.iter_rows(named=True):
        key = (_as_date(r["gameday"]), frozenset({r["home_team"], r["away_team"]}))
        out.setdefault(key, []).append(r["game_id"])
    return out


def _pack_book(book: dict, home: str, away: str, game_id: str, fetched_at: datetime) -> dict:
    last = book.get("last_update")
    if not last:
        raise RuntimeError(f"Odds API book {book.get('key')!r} missing last_update")
    row: dict[str, Any] = {
        "game_id": game_id,
        "captured_at": _parse_ts(last),
        "source": SOURCE,
        "bookmaker": book["key"],
        "fetched_at": fetched_at,
        "spread_line": None,
        "total_line": None,
        "away_moneyline": None,
        "home_moneyline": None,
        "away_spread_odds": None,
        "home_spread_odds": None,
        "over_odds": None,
        "under_odds": None,
    }
    for market in book.get("markets") or []:
        key = market.get("key")
        for o in market.get("outcomes") or []:
            name = o.get("name")
            price = o.get("price")
            if key == "h2h":
                abbr = map_team(name)
                if abbr == home:
                    row["home_moneyline"] = price
                elif abbr == away:
                    row["away_moneyline"] = price
                else:
                    raise UnmappedTeam(name)
            elif key == "spreads":
                abbr = map_team(name)
                if abbr == home:
                    row["home_spread_odds"] = price
                    if o.get("point") is not None:
                        row["spread_line"] = -float(o["point"])
                elif abbr == away:
                    row["away_spread_odds"] = price
                else:
                    raise UnmappedTeam(name)
            elif key == "totals":
                if name == "Over":
                    row["over_odds"] = price
                    if o.get("point") is not None:
                        row["total_line"] = float(o["point"])
                elif name == "Under":
                    row["under_odds"] = price
                    if o.get("point") is not None:
                        row["total_line"] = float(o["point"])
    return row


def parse_events(payload: list[dict], schedules: pl.DataFrame, fetched_at: datetime) -> ParseResult:
    lookup = _lookup(schedules)
    rows: list[dict] = []
    skipped: list[dict] = []
    n_matched = 0
    for event in payload:
        home_name = event["home_team"]
        away_name = event["away_team"]
        home, away = map_team(home_name), map_team(away_name)
        day = et_date(event["commence_time"])
        ids = lookup.get((day, frozenset({home, away})), [])
        if len(ids) != 1:
            skipped.append({"home": home_name, "away": away_name, "date": day.isoformat()})
            continue
        n_matched += 1
        for book in event.get("bookmakers") or []:
            rows.append(_pack_book(book, home, away, ids[0], fetched_at))
    frame = pl.DataFrame(rows) if rows else _empty_rows()
    if rows:
        frame = frame.with_columns(
            pl.col("captured_at").dt.replace_time_zone("UTC"),
            pl.col("fetched_at").dt.replace_time_zone("UTC"),
        )
    return ParseResult(rows=frame, skipped=skipped, n_matched=n_matched)


def require_matches(result: ParseResult) -> ParseResult:
    if result.n_matched == 0:
        raise ZeroMatch(result.skipped)
    return result


def recent_duplicate_n(pending: pl.DataFrame, existing: pl.DataFrame) -> int:
    if pending.is_empty() or existing.is_empty():
        return 0
    keys = ["game_id", "bookmaker", "captured_at"]
    return pending.select(keys).join(existing.select(keys), on=keys, how="inner").height


def remaining_warning(remaining: int | None) -> str | None:
    if remaining is not None and remaining < 100:
        return f"WARNING: Odds API credits remaining={remaining} (<100)"
    return None


def fetch(markets: str, regions: str, api_key: str | None = None) -> tuple[list, dict]:
    key = api_key if api_key is not None else odds_api_key()
    qs = urlencode({
        "apiKey": key, "regions": regions, "markets": markets, "oddsFormat": "american",
    })
    req = Request(f"{ODDS_URL}?{qs}")
    status = None
    url_err = None
    try:
        with urlopen(req, context=_SSL) as resp:
            remaining = resp.headers.get("x-requests-remaining")
            used = resp.headers.get("x-requests-used")
            payload = json.load(resp)
    except HTTPError as e:
        status = e.code
        e.close()
    except URLError as e:
        url_err = str(e.reason) if e.reason else "request failed"
    if status is not None:
        raise RuntimeError(f"Odds API HTTP {status}")
    if url_err is not None:
        raise RuntimeError(f"Odds API request failed: {url_err}")
    return payload, {"x-requests-remaining": remaining, "x-requests-used": used}


def _as_int(v) -> int | None:
    if v is None or v == "":
        return None
    return int(v)


def _count_recent(pending: pl.DataFrame, now: datetime) -> int:
    if pending.is_empty():
        return 0
    existing = read_sql(
        """
        select game_id, bookmaker, captured_at
        from raw.market_lines
        where source = %s and fetched_at >= %s
        """,
        (SOURCE, now - timedelta(minutes=RECENT_MINUTES)),
    )
    if existing.is_empty():
        return 0
    existing = existing.with_columns(pl.col("captured_at").dt.replace_time_zone("UTC"))
    pending = pending.with_columns(pl.col("captured_at").dt.replace_time_zone("UTC"))
    return recent_duplicate_n(pending, existing)


def load_schedules() -> pl.DataFrame:
    return read_sql("select game_id, gameday, home_team, away_team from raw.schedules")


def run(markets: str = "h2h,spreads,totals", regions: str = "us", force: bool = False) -> dict:
    fetched_at = datetime.now(UTC)
    payload, headers = fetch(markets, regions)
    remaining = _as_int(headers.get("x-requests-remaining"))
    used = _as_int(headers.get("x-requests-used"))
    parsed = parse_events(payload, load_schedules(), fetched_at)
    require_matches(parsed)
    n_dup = _count_recent(parsed.rows, fetched_at)
    if n_dup and not force:
        raise RecentDuplicate(n_dup)
    written = insert_ignore(parsed.rows.select(ROW_COLS), "raw.market_lines") if not parsed.rows.is_empty() else 0
    books = parsed.rows["bookmaker"].n_unique() if not parsed.rows.is_empty() else 0
    return {
        "written": written,
        "books": books,
        "skipped": parsed.skipped,
        "skipped_n": len(parsed.skipped),
        "remaining": remaining,
        "used": used,
        "fetched_at": fetched_at,
    }
