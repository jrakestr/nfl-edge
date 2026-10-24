"""FantasyPros player news -> raw.fantasypros_news (append-only, on conflict do nothing).

One pull fetches the latest news items, maps `player_id` (FantasyPros id) to `raw.players.gsis_id`
via `fantasypros_match`, normalizes team codes via `names.TEAM_ALIASES`, and inserts new `news_id`
rows while preserving `first_seen_at` on already-seen items.

Display and qualitative research audit only (AGENTS.md); nothing in sim/, priors/, overrides, or
the optimizer reads this table.
"""
from __future__ import annotations

from datetime import UTC, datetime

import polars as pl

from . import fantasypros_match as M
from . import names as N

NEWS_SCHEMA = {
    "news_id": pl.Int64,
    "fp_player_id": pl.Utf8,
    "player_id": pl.Utf8,
    "team": pl.Utf8,
    "created_at": pl.Datetime(time_zone="UTC"),
    "first_seen_at": pl.Datetime(time_zone="UTC"),
    "title": pl.Utf8,
    "description": pl.Utf8,
    "impact": pl.Utf8,
    "categories": pl.List(pl.Utf8),
    "author": pl.Utf8,
    "link": pl.Utf8,
}


def parse_created_utc(raw: str | None) -> datetime:
    """Parse FantasyPros `created` ('YYYY-MM-DD HH:MM:SS' in UTC) into a UTC datetime."""
    if not raw or not str(raw).strip():
        raise ValueError("FantasyPros news item is missing `created` timestamp")
    s = str(raw).strip()
    dt = datetime.fromisoformat(s)
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


def news_rows(
    resp: dict,
    fp_map: dict[str, str],
    teams: dict,
    first_seen_at: datetime,
) -> tuple[list[dict], list[dict]]:
    """Map API `items` to `raw.fantasypros_news` rows + unmatched player list. Pure."""
    rows: list[dict] = []
    unmatched: list[dict] = []
    seen_ids: set[int] = set()
    for item in resp.get("items") or []:
        raw_id = item.get("id")
        if raw_id is None:
            raise ValueError("FantasyPros news item is missing `id`")
        nid = int(raw_id)
        if nid in seen_ids:
            continue
        seen_ids.add(nid)
        created_at = parse_created_utc(item.get("created"))
        fp_pid = str(item["player_id"]).strip() if item.get("player_id") is not None else None
        if fp_pid == "" or fp_pid == "0":
            fp_pid = None
        gsis_id = fp_map.get(fp_pid) if fp_pid else None
        raw_team = item.get("team_id")
        team = N.normalize_team(raw_team, teams) if raw_team else None
        title = str(item.get("title") or "").strip()
        desc = str(item.get("desc") or "").strip()
        impact = str(item.get("impact") or "").strip()
        cats = [str(c).strip() for c in (item.get("categories") or []) if str(c).strip()]
        author = str(item.get("author") or "").strip() or None
        link = str(item.get("link") or "").strip() or None
        rows.append({
            "news_id": nid,
            "fp_player_id": fp_pid,
            "player_id": gsis_id,
            "team": team,
            "created_at": created_at,
            "first_seen_at": first_seen_at,
            "title": title,
            "description": desc,
            "impact": impact,
            "categories": cats,
            "author": author,
            "link": link,
        })
        if fp_pid and gsis_id is None:
            unmatched.append({"news_id": nid, "fp_player_id": fp_pid, "team": team, "title": title})
    return rows, unmatched


def to_news_frame(rows: list[dict]) -> pl.DataFrame:
    if not rows:
        return pl.DataFrame(schema=NEWS_SCHEMA)
    return pl.DataFrame(rows, schema=NEWS_SCHEMA)


def run(category: str | None = None, limit: int = 100, client=None) -> dict:
    """One FantasyPros news pull -> raw.fantasypros_news (insert_ignore on news_id)."""
    from ..db import insert_ignore
    from .fantasypros import Client

    client = client or Client()
    resp = client.news(category=category, limit=limit)
    first_seen = datetime.now(UTC)
    rows, unmatched = news_rows(resp, M.load_fp_map(), N.load_teams(), first_seen)
    frame = to_news_frame(rows)
    written = insert_ignore(frame, "raw.fantasypros_news")
    return {
        "calls": client.calls,
        "items": len(rows),
        "written": written,
        "matched": sum(1 for r in rows if r["player_id"]),
        "unmatched_n": len(unmatched),
        "unmatched": unmatched,
        "first_seen_at": first_seen.isoformat(),
    }
