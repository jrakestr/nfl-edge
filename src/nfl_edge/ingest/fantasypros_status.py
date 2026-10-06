"""FantasyPros injuries -> raw.player_overrides. The most recent information wins, whatever the source.

A FantasyPros status replaces a saved row from any source only when the FantasyPros information is
newer than that row's `updated_at`. FantasyPros time is min(injury_update_date, fetched_at): most
rows carry the feed's refresh stamp (about the pull time), and a genuinely old injury date is kept
so an older FantasyPros report cannot override a newer manual or DK entry. A newer saved row from
another source is left alone and reported.

Statuses written (QB/RB/WR/TE on teams playing the week): O, IR, PUP, S, NFI -> out; D -> doubtful;
Q -> questionable (usage 1.0), and Q is written only to replace an older row that says something
different, since a Q with no saved row carries no usage signal. Rows this module writes carry the
note prefix `fp `. A saved `fp ` row for a player FantasyPros no longer lists is reported and left
in place: absence from a feed is not evidence the player is healthy.
"""
from __future__ import annotations

from datetime import UTC, datetime

import polars as pl

from . import fantasypros_match as M
from . import names as N
from .overrides import write_overrides

PREFIX = "fp "
SKILL_POS = frozenset({"QB", "RB", "WR", "TE"})
OUT_SHORT = frozenset({"O", "IR", "PUP", "S", "NFI"})
STRENGTH = {"out": 3, "doubtful": 2, "questionable": 1}


def is_fp_note(note: object | None) -> bool:
    return str(note or "").strip().lower().startswith(PREFIX)


def _note(short: str, when: datetime) -> str:
    return f"{PREFIX}{short} {when.strftime('%Y-%m-%d')}"


def _parse_ts(value: object | None) -> datetime | None:
    if not value:
        return None
    try:
        ts = datetime.fromisoformat(str(value).strip())
    except ValueError:
        return None
    return ts if ts.tzinfo else ts.replace(tzinfo=UTC)


def _aware(value: object | None) -> datetime | None:
    if value is None:
        return None
    return value if getattr(value, "tzinfo", None) else value.replace(tzinfo=UTC)


def decide(resp: dict, fp_map: dict[str, str], catalog: pl.DataFrame, aliases: dict[str, str],
           teams: dict, week_teams: set[str], existing: dict[str, dict],
           fetched_at: datetime | None = None) -> dict:
    """Pure: injuries response -> override actions. `existing[pid]` = {status, note, updated_at}."""
    fetched_at = _aware(fetched_at) or datetime.now(UTC)
    prepared = catalog if "_dn" in catalog.columns else N.prepare_catalog(catalog)
    ignored = {"non_skill": 0, "free_agent": 0, "off_week": 0, "unknown_status": 0}
    unknown_statuses: set[str] = set()
    unmatched: list[dict] = []
    wanted: dict[str, dict] = {}

    for x in resp["injuries"]:
        pos = N.normalize_pos(x.get("position_id"))
        if pos not in SKILL_POS:
            ignored["non_skill"] += 1
            continue
        short = str(x.get("status_short") or "").strip().upper()
        if short in OUT_SHORT:
            status = "out"
        elif short == "D":
            status = "doubtful"
        elif short == "Q":
            status = "questionable"
        else:
            ignored["unknown_status"] += 1
            unknown_statuses.add(short or str(x.get("status")))
            continue
        team = N.normalize_team(x.get("team_id"), teams) or ""
        if team in ("", "FA"):
            ignored["free_agent"] += 1
            continue
        if team not in week_teams:
            ignored["off_week"] += 1
            continue
        name = str(x.get("name") or "").strip()
        m = M.match_player(x.get("player_id"), name, team, pos, fp_map, prepared, aliases, teams)
        if m.player_id is None:
            unmatched.append({"name": name, "team": team, "position": pos,
                              "reason": m.reason or "unmatched"})
            continue
        prev = wanted.get(m.player_id)
        if prev is not None and STRENGTH[prev["status"]] >= STRENGTH[status]:
            continue  # FantasyPros lists a player twice: keep the stronger signal
        reported = _parse_ts(x.get("injury_update_date"))
        info_time = min(reported, fetched_at) if reported else fetched_at
        wanted[m.player_id] = {
            "player_id": m.player_id, "name": name, "status": status,
            "usage_multiplier": 0.0 if status != "questionable" else 1.0,
            "note": _note(short, info_time), "info_time": info_time,
        }

    upserts, kept_newer, already = [], [], []
    quiet_questionable = 0
    for pid in sorted(wanted):
        w = wanted[pid]
        ex = existing.get(pid)
        old = None if not ex else ex.get("status")
        if ex is None:
            if w["status"] == "questionable":
                quiet_questionable += 1  # nothing saved to replace, and Q carries no usage signal
                continue
            upserts.append({**w, "old": None, "old_note": None, "replaces": None})
            continue
        if ex.get("status") == w["status"] and (is_fp_note(ex.get("note")) is False
                                                  or (ex.get("note") or "") == w["note"]):
            already.append({"player_id": pid, "name": w["name"], "status": w["status"]})
            continue
        if is_fp_note(ex.get("note")):
            upserts.append({**w, "old": old, "old_note": ex.get("note"), "replaces": "fantasypros"})
            continue
        saved_at = _aware(ex.get("updated_at"))
        if saved_at is not None and w["info_time"] <= saved_at:
            kept_newer.append({"player_id": pid, "name": w["name"], "saved_status": old,
                               "saved_note": ex.get("note"), "saved_at": saved_at,
                               "fp_status": w["status"], "fp_time": w["info_time"]})
            continue
        upserts.append({**w, "old": old, "old_note": ex.get("note"), "replaces": "other source",
                        "saved_at": saved_at})

    stale = [
        {"player_id": pid, "status": ex.get("status"), "note": ex.get("note")}
        for pid, ex in sorted(existing.items())
        if is_fp_note(ex.get("note")) and pid not in wanted
    ]
    return {"upserts": upserts, "kept_newer": kept_newer, "already": already,
            "unmatched": unmatched, "stale": stale, "ignored": ignored,
            "questionable_without_saved_row": quiet_questionable,
            "unknown_statuses": sorted(unknown_statuses)}


def load_existing_with_time(season: int, week: int) -> dict[str, dict]:
    from ..db import read_sql

    df = read_sql(
        "select player_id, status, note, updated_at from raw.player_overrides "
        "where season = %s and week = %s",
        (season, week),
    )
    return {str(r["player_id"]): {"status": r.get("status"), "note": r.get("note"),
                                  "updated_at": r.get("updated_at")}
            for r in df.to_dicts() if r.get("player_id")}


def _load(season: int, week: int):
    from .overrides import load_catalog
    from .rts_status import load_week_teams

    week_teams = load_week_teams(season, week)
    if not week_teams:
        raise ValueError(f"no REG games in raw.schedules for {season} week {week}")
    return load_catalog(), M.load_fp_map(), week_teams, load_existing_with_time(season, week)


def run(season: int, week: int, dry_run: bool = False, client=None) -> dict:
    """One injuries pull. Fails closed before any write if the API answer is not usable."""
    from .fantasypros import Client

    client = client or Client()
    resp = client.injuries(season, week)
    fetched_at = datetime.now(UTC)
    catalog, fp_map, week_teams, existing = _load(season, week)
    d = decide(resp, fp_map, catalog, N.load_aliases(), N.load_teams(), week_teams, existing,
               fetched_at)

    written = 0
    if d["upserts"] and not dry_run:
        frame = pl.DataFrame(
            [{k: u[k] for k in ("player_id", "status", "usage_multiplier", "note")} for u in d["upserts"]]
        ).with_columns(pl.lit(season).alias("season"), pl.lit(week).alias("week")).select(
            ["season", "week", "player_id", "status", "usage_multiplier", "note"])
        written = write_overrides(frame)
    return {"season": season, "week": week, "calls": client.calls, "dry_run": dry_run,
            "written": written, **d}
