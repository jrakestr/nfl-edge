"""Permanent DK id → gsis map. nflverse ff_playerids has no DraftKings column (checked 2026-09).

Match order: existing crosswalk row, alias, name+team+pos, name+team, unique
full name. Team aliases (LAR→LA, JAC→JAX, WSH→WAS) apply before the filter.
Name keys go through names.merge_key / last_name (the LineupCard suffix port).
A unique-name match must appear on raw.rosters_weekly in the last RECENT_SEASONS
seasons. Two same-name hits: keep the one with a recent roster; two recent with
the same DK position stay unmatched; two recent and exactly one matching the
DK-listed position is a match. Last-name-only is not a match.
"""
from __future__ import annotations

from dataclasses import dataclass

import polars as pl

from ..db import execute, insert_ignore, read_sql
from . import names as N

CROSSWALK_TABLE = "raw.dk_player_crosswalk"
RECENT_SEASONS = 3


@dataclass
class Resolve:
    gsis_id: str | None
    source: str | None
    automatic: bool
    reason: str | None  # unmatched | ambiguous | None if matched


def _unique_gsis(hits: pl.DataFrame) -> tuple[str | None, int]:
    if hits.is_empty():
        return None, 0
    seen: list[str] = []
    for i in hits["gsis_id"].to_list():
        if i and i not in seen:
            seen.append(i)
    if len(seen) == 1:
        return seen[0], 1
    return None, len(seen)


def resolve_row(row: dict, catalog: pl.DataFrame, teams: dict,
                aliases: dict[str, str] | None = None,
                recent_ids: set[str] | None = None) -> Resolve:
    name = str(row.get("name") or row.get("player") or "").strip()
    if not name:
        return Resolve(None, None, True, "unmatched")
    cat = catalog if "_dn" in catalog.columns else N.prepare_catalog(catalog)
    team = N.normalize_team(row.get("team"), teams)
    pos = N.normalize_pos(row.get("position"))
    if pos == "DST":
        dst = N.match_dst(name, row.get("position"), row.get("team"), teams)
        if dst:
            return Resolve(dst, "dst", True, None)
        return Resolve(None, None, True, "unmatched")

    key = N.merge_key(name)
    if aliases and key in aliases:
        return Resolve(aliases[key], "alias", True, None)

    by_name = cat.filter((pl.col("_mn") == key) | (pl.col("_dn") == key))

    hits = by_name
    if team:
        hits = hits.filter(pl.col("_team") == team)
    if pos:
        hits = hits.filter(pl.col("_pos") == pos)
    gsis, n = _unique_gsis(hits)
    if gsis:
        return Resolve(gsis, "name_team_pos", True, None)
    if n > 1:
        return Resolve(None, None, True, "ambiguous")

    if team:
        hits = by_name.filter(pl.col("_team") == team)
        gsis, n = _unique_gsis(hits)
        if gsis:
            return Resolve(gsis, "name_team", True, None)
        if n > 1:
            return Resolve(None, None, True, "ambiguous")

    recent = recent_ids or set()
    gsis, n = _unique_gsis(by_name)
    if n == 1 and gsis:
        if gsis in recent:
            return Resolve(gsis, "name", True, None)
        return Resolve(None, None, True, "unmatched")
    if n > 1:
        recent_hits = by_name.filter(pl.col("gsis_id").is_in(list(recent)))
        gsis, rn = _unique_gsis(recent_hits)
        if gsis:
            return Resolve(gsis, "name_recent", True, None)
        if rn > 1 and pos:
            pos_hits = recent_hits.filter(pl.col("_pos") == pos)
            gsis, pn = _unique_gsis(pos_hits)
            if gsis:
                return Resolve(gsis, "name_recent", True, None)
            if pn > 1:
                return Resolve(None, None, True, "ambiguous")
            return Resolve(None, None, True, "unmatched")
        if rn > 1:
            return Resolve(None, None, True, "ambiguous")
        return Resolve(None, None, True, "unmatched")

    return Resolve(None, None, True, "unmatched")


def load_existing() -> dict[str, str]:
    df = read_sql("select player_dk_id, gsis_id from raw.dk_player_crosswalk")
    if df.is_empty():
        return {}
    return {str(r["player_dk_id"]): str(r["gsis_id"]) for r in df.to_dicts() if r.get("gsis_id")}


def load_manual_ids() -> set[str]:
    df = read_sql("select player_dk_id from raw.dk_player_crosswalk where automatic is not true")
    if df.is_empty():
        return set()
    return {str(r["player_dk_id"]) for r in df.to_dicts()}


def load_recent_ids(seasons: int = RECENT_SEASONS) -> set[str]:
    df = read_sql(
        """
        select distinct gsis_id
        from raw.rosters_weekly
        where season >= (select coalesce(max(season), 0) from raw.rosters_weekly) - %s + 1
          and gsis_id is not null
        """,
        (seasons,),
    )
    if df.is_empty():
        return set()
    return {str(i) for i in df["gsis_id"].to_list() if i}


def apply_to_rows(rows: list[dict], catalog: pl.DataFrame, teams: dict,
                  existing: dict[str, str] | None = None,
                  aliases: dict[str, str] | None = None,
                  recent_ids: set[str] | None = None) -> tuple[list[dict], list[dict]]:
    """Fill player_id. Returns (rows, new automatic crosswalk records)."""
    catalog = N.prepare_catalog(catalog)
    have = existing if existing is not None else {}
    new_rows: list[dict] = []
    out: list[dict] = []
    for row in rows:
        dk = str(row.get("player_dk_id") or "")
        if dk and dk in have:
            out.append({**row, "player_id": have[dk], "match_reason": None})
            continue
        r = resolve_row(row, catalog, teams, aliases=aliases, recent_ids=recent_ids)
        if r.gsis_id:
            out.append({**row, "player_id": r.gsis_id, "match_reason": None})
            if dk:
                new_rows.append({
                    "player_dk_id": dk,
                    "gsis_id": r.gsis_id,
                    "source": r.source,
                    "automatic": True,
                })
            continue
        out.append({**row, "player_id": None, "match_reason": r.reason or "unmatched"})
    return out, new_rows


def revoke_stale_name_matches() -> int:
    """Drop automatic unique-name rows whose gsis is not on a recent roster."""
    recent = load_recent_ids()
    rows = read_sql(
        """
        select player_dk_id, gsis_id
        from raw.dk_player_crosswalk
        where automatic is true and source = 'name'
        """
    )
    if rows.is_empty():
        return 0
    stale = [str(r["player_dk_id"]) for r in rows.to_dicts() if r["gsis_id"] not in recent]
    if not stale:
        return 0
    execute(
        """
        update raw.dk_salaries s
        set player_id = null
        where s.player_dk_id = any(%s)
          and s.player_id is not null
        """,
        (stale,),
    )
    return execute(
        "delete from raw.dk_player_crosswalk where player_dk_id = any(%s) and source = 'name'",
        (stale,),
    )


def persist_new(new_rows: list[dict], skip_ids: set[str] | None = None) -> int:
    skip = skip_ids or set()
    recs = [r for r in new_rows if r["player_dk_id"] not in skip]
    if not recs:
        return 0
    return insert_ignore(pl.DataFrame(recs), CROSSWALK_TABLE)


def seed_from_salaries() -> int:
    return execute(
        """
        insert into raw.dk_player_crosswalk (player_dk_id, gsis_id, source, automatic)
        select distinct on (player_dk_id) player_dk_id, player_id, 'salary', true
        from raw.dk_salaries
        where player_id is not null and player_id <> ''
        order by player_dk_id
        on conflict (player_dk_id) do nothing
        """
    )


def backfill_salaries() -> int:
    return execute(
        """
        update raw.dk_salaries s
        set player_id = x.gsis_id
        from raw.dk_player_crosswalk x
        where s.player_dk_id = x.player_dk_id
          and (s.player_id is null or s.player_id = '')
        """
    )


def populate_unmatched(slate_id: str | None = None) -> dict:
    """Resolve salary rows that still lack a gsis, persist, backfill. First write wins."""
    revoked = revoke_stale_name_matches()
    seeded = seed_from_salaries()
    sql = """
        select distinct on (s.player_dk_id)
          s.player_dk_id, s.name, s.team, s.position
        from raw.dk_salaries s
        left join raw.dk_player_crosswalk x on x.player_dk_id = s.player_dk_id
        where (s.player_id is null or s.player_id = '')
          and x.player_dk_id is null
    """
    params: tuple | None = None
    if slate_id:
        sql += " and s.slate_id = %s"
        params = (slate_id,)
    sql += " order by s.player_dk_id"
    pending = read_sql(sql, params)
    rows = pending.to_dicts() if not pending.is_empty() else []
    catalog = read_sql(
        "select gsis_id, display_name, merge_name, latest_team, position from raw.players"
    )
    teams = N.load_teams()
    aliases = N.load_aliases()
    resolved, new_rows = apply_to_rows(
        rows, catalog, teams, existing={}, aliases=aliases, recent_ids=load_recent_ids(),
    )
    written = persist_new(new_rows, skip_ids=load_manual_ids())
    filled = backfill_salaries()
    unmatched = [r for r in resolved if not r.get("player_id")]
    return {
        "revoked": revoked,
        "seeded": seeded,
        "pending": len(rows),
        "matched": len(rows) - len(unmatched),
        "unmatched_n": len(unmatched),
        "unmatched": unmatched,
        "written": written,
        "backfilled": filled,
    }
