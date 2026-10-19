"""DK salary files straight from DraftKings' lobby, so nobody downloads CSVs by hand.

Unofficial, unauthenticated endpoints (the ones the DK site calls; see docs/agents/dfs.md):
  lobby   https://www.draftkings.com/lobby/getcontests?sport=NFL         -> DraftGroups
  csv     https://www.draftkings.com/lineup/getavailableplayerscsv?contestTypeId=..&draftGroupId=..
The CSV is byte-for-byte the "Export to CSV" file. No account, no cookies.

Slate names (data/dk/DKSalaries_{season}_wk{WW}_{slate}.csv):
  classic (contest type 21): no suffix -> main; "(Early)" -> early, "(Turbo)" -> turbo, ...;
                             "(Sun-Mon)" / "(Thu-Mon)" -> full
  showdown (contest type 96): "(WAS @ SF)" -> showdown-was-sf
Other contest types (quarters, snake, Madden, Sit & Go...) are skipped.
A draft group belongs to week W only when every Game Info date in its CSV falls inside week W's
schedule dates; anything spanning weeks ("Mon-Thu") is skipped and named. Fail closed: a file that
does not parse as a DK export is not written.
"""
from __future__ import annotations

import csv
import io
import re
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path

import httpx

from ..config import DATA_DIR

LOBBY_URL = "https://www.draftkings.com/lobby/getcontests?sport=NFL"
CSV_URL = "https://www.draftkings.com/lineup/getavailableplayerscsv"
USER_AGENT = "nfl-edge/1.0 (personal DFS tool)"
CLASSIC, SHOWDOWN = 21, 96
FULL_ALIASES = ("thu-mon", "sun-mon")  # first one present becomes `full`
HEADER = "Position,Name + ID,Name,ID,Roster Position,Salary,Game Info,TeamAbbrev"
GAME_DATE = re.compile(r"(\d{2}/\d{2}/\d{4})")


class LobbyError(RuntimeError):
    pass


@dataclass(frozen=True)
class Group:
    draft_group_id: int
    contest_type_id: int
    suffix: str | None
    start_date_est: str
    game_count: int


@dataclass
class Fetched:
    slate: str
    group: Group
    rows: int
    games: list[str]
    path: Path | None = None
    skipped: str | None = None


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def slate_name(g: Group) -> str | None:
    """Pipeline slate key for a draft group, or None when the contest type is not DFS we run."""
    suffix = (g.suffix or "").strip().strip("()").strip()
    if g.contest_type_id == CLASSIC:
        return "main" if not suffix else _slug(suffix)
    if g.contest_type_id == SHOWDOWN:
        return f"showdown-{_slug(suffix.replace('@', ' '))}" if suffix else "showdown"
    return None


def assign_names(groups: list[Group]) -> dict[int, str]:
    """draft_group_id -> slate. `full` goes to the first FULL_ALIASES label present."""
    names = {g.draft_group_id: n for g in groups if (n := slate_name(g))}
    for alias in FULL_ALIASES:
        hit = [gid for gid, n in names.items() if n == alias]
        if hit and "full" not in names.values():
            names[hit[0]] = "full"
            break
    return names


def parse_lobby(payload: dict) -> list[Group]:
    out = []
    for d in payload.get("DraftGroups") or []:
        try:
            out.append(Group(int(d["DraftGroupId"]), int(d["ContestTypeId"]),
                             d.get("ContestStartTimeSuffix"), str(d.get("StartDateEst") or ""),
                             int(d.get("GameCount") or 0)))
        except (KeyError, TypeError, ValueError):
            continue
    return out


def csv_games(text: str) -> tuple[int, list[str], list[date]]:
    """(player rows, sorted distinct matchups, sorted distinct game dates) of a DK export."""
    body = text.lstrip("﻿")
    if not body.startswith(HEADER):
        raise LobbyError("not a DK salary export (header does not match)")
    rows = list(csv.DictReader(io.StringIO(body)))
    games, dates = set(), set()
    for r in rows:
        info = (r.get("Game Info") or "").strip()
        if not info:
            continue
        games.add(info.split(" ")[0])
        m = GAME_DATE.search(info)
        if m:
            dates.add(datetime.strptime(m.group(1), "%m/%d/%Y").date())
    return len(rows), sorted(games), sorted(dates)


def in_week(dates: list[date], first: date, last: date) -> bool:
    return bool(dates) and all(first <= d <= last for d in dates)


def week_window(season: int, week: int) -> tuple[date, date]:
    from ..db import read_sql

    df = read_sql(
        "select min(gameday)::date as a, max(gameday)::date as b from raw.schedules "
        "where season = %s and week = %s and game_type = 'REG'",
        (season, week),
    )
    if df.is_empty() or df[0, "a"] is None:
        raise LobbyError(f"no schedule dates for {season} week {week}")
    return df[0, "a"], df[0, "b"]


def fetch(season: int, week: int, write: bool = True,
          client: httpx.Client | None = None) -> list[Fetched]:
    """Download every classic/showdown salary file for the week into data/dk/."""
    first, last = week_window(season, week)
    own = client is None
    c = client or httpx.Client(timeout=60, headers={"User-Agent": USER_AGENT}, follow_redirects=True)
    try:
        r = c.get(LOBBY_URL)
        if r.status_code != 200:
            raise LobbyError(f"DK lobby: HTTP {r.status_code}")
        groups = [g for g in parse_lobby(r.json()) if g.contest_type_id in (CLASSIC, SHOWDOWN)]
        # cheap pre-filter on the group's own start date; the CSV dates decide
        groups = [g for g in groups if g.start_date_est[:10] and
                  first <= date.fromisoformat(g.start_date_est[:10]) <= last]
        names = assign_names(groups)
        out: list[Fetched] = []
        for g in groups:
            slate = names.get(g.draft_group_id)
            if not slate:
                continue
            resp = c.get(CSV_URL, params={"contestTypeId": g.contest_type_id,
                                          "draftGroupId": g.draft_group_id})
            if resp.status_code != 200:
                out.append(Fetched(slate, g, 0, [], skipped=f"HTTP {resp.status_code}"))
                continue
            try:
                n, games, dates = csv_games(resp.text)
            except LobbyError as e:
                out.append(Fetched(slate, g, 0, [], skipped=str(e)))
                continue
            if not in_week(dates, first, last):
                span = f"{dates[0]}..{dates[-1]}" if dates else "no dates"
                out.append(Fetched(slate, g, n, games,
                                   skipped=f"games {span} fall outside week {week} ({first}..{last})"))
                continue
            f = Fetched(slate, g, n, games)
            if write:
                f.path = DATA_DIR / "dk" / f"DKSalaries_{season}_wk{week:02d}_{slate}.csv"
                f.path.parent.mkdir(parents=True, exist_ok=True)
                f.path.write_text(resp.text, encoding="utf-8")
            out.append(f)
        return out
    finally:
        if own:
            c.close()
