"""FantasyPros injuries -> raw.player_overrides, scoped to this source by the `fp ` note prefix.

Writes only out/doubtful rows (O, IR, PUP, S, NFI -> out; D -> doubtful) for QB/RB/WR/TE on teams
playing the week. Questionable is ignored: it carries no usage signal here, and a row for it could
shadow another source's OUT. Rows from any other source (manual, claims, dk, rts) are never touched,
and a FantasyPros row is only ever replaced by a newer FantasyPros status. A player FantasyPros
stops listing is reported as stale, not cleared (absence is not evidence of health).
"""
from __future__ import annotations

import polars as pl

from . import fantasypros_match as M
from . import names as N
from .overrides import write_overrides

PREFIX = "fp "
SKILL_POS = frozenset({"QB", "RB", "WR", "TE"})
OUT_SHORT = frozenset({"O", "IR", "PUP", "S", "NFI"})
DOUBTFUL_SHORT = frozenset({"D"})


def is_fp_note(note: object | None) -> bool:
    return str(note or "").strip().lower().startswith(PREFIX)


def _note(short: str, updated: object | None) -> str:
    day = str(updated or "")[:10]
    return f"{PREFIX}{short} {day}".strip()


def decide(resp: dict, fp_map: dict[str, str], catalog: pl.DataFrame, aliases: dict[str, str],
           teams: dict, week_teams: set[str], existing: dict[str, dict]) -> dict:
    """Pure: injuries response -> override actions. Never clears; never touches other sources."""
    prepared = catalog if "_dn" in catalog.columns else N.prepare_catalog(catalog)
    ignored = {"non_skill": 0, "questionable": 0, "free_agent": 0, "off_week": 0, "unknown_status": 0}
    unknown_statuses: set[str] = set()
    unmatched: list[dict] = []
    wanted: dict[str, dict] = {}

    for x in resp["injuries"]:
        pos = N.normalize_pos(x.get("position_id"))
        if pos not in SKILL_POS:
            ignored["non_skill"] += 1
            continue
        short = str(x.get("status_short") or "").strip().upper()
        if short == "Q":
            ignored["questionable"] += 1
            continue
        if short in OUT_SHORT:
            status = "out"
        elif short in DOUBTFUL_SHORT:
            status = "doubtful"
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
        if prev is not None and prev["status"] == "out":
            continue  # keep the stronger signal if FantasyPros lists a player twice
        wanted[m.player_id] = {
            "player_id": m.player_id, "name": name, "status": status,
            "usage_multiplier": 0.0, "note": _note(short, x.get("injury_update_date")),
        }

    upserts, protected, already = [], [], []
    for pid in sorted(wanted):
        w = wanted[pid]
        ex = existing.get(pid)
        old = None if not ex else ex.get("status")
        if ex and not is_fp_note(ex.get("note")):
            protected.append({"player_id": pid, "name": w["name"], "old": old,
                              "would": w["status"], "note": ex.get("note")})
            continue
        if ex and ex.get("status") == w["status"] and (ex.get("note") or "") == w["note"]:
            already.append({"player_id": pid, "name": w["name"], "status": w["status"]})
            continue
        upserts.append({**w, "old": old})

    stale = [
        {"player_id": pid, "status": ex.get("status"), "note": ex.get("note")}
        for pid, ex in sorted(existing.items())
        if is_fp_note(ex.get("note")) and pid not in wanted
    ]
    return {"upserts": upserts, "protected": protected, "already": already,
            "unmatched": unmatched, "stale": stale, "ignored": ignored,
            "unknown_statuses": sorted(unknown_statuses)}


def _load(season: int, week: int):
    from .overrides import load_catalog
    from .rts_status import load_existing, load_week_teams

    week_teams = load_week_teams(season, week)
    if not week_teams:
        raise ValueError(f"no REG games in raw.schedules for {season} week {week}")
    return load_catalog(), M.load_fp_map(), week_teams, load_existing(season, week)


def run(season: int, week: int, dry_run: bool = False, client=None) -> dict:
    """One injuries pull. Fails closed before any write if the API answer is not usable."""
    from .fantasypros import Client

    client = client or Client()
    resp = client.injuries(season, week)
    catalog, fp_map, week_teams, existing = _load(season, week)
    d = decide(resp, fp_map, catalog, N.load_aliases(), N.load_teams(), week_teams, existing)

    written = 0
    if d["upserts"] and not dry_run:
        frame = pl.DataFrame(d["upserts"]).with_columns(
            pl.lit(season).alias("season"), pl.lit(week).alias("week"),
        ).select(["season", "week", "player_id", "status", "usage_multiplier", "note"])
        written = write_overrides(frame)
    return {"season": season, "week": week, "calls": client.calls, "dry_run": dry_run,
            "written": written, **d}
