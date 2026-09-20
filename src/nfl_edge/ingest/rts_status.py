"""Load an RTS projection export (plus an optional second source) as availability.

RTS's signal for "not playing" is projected points = 0.00 with a real salary.
A second CSV may carry status letters (Q, D, O, I = injured reserve, P = PUP).

Only writes raw.player_overrides. Never overwrites a manual or claims-promote
row (note without a dk/rts prefix), and never clears an existing override:
a player a source projects above zero keeps whatever override is stored.
"""
from __future__ import annotations

import shutil
from datetime import UTC, datetime
from pathlib import Path

import polars as pl

from ..config import DATA_DIR, ROOT
from ..db import read_sql
from . import names as N
from .overrides import write_overrides

SKILL_POS = frozenset({"QB", "RB", "WR", "TE"})
ZERO_OUT_POS = frozenset({"RB", "WR", "TE"})  # QB zeros are the share defect, not injury
OUT_LETTERS = frozenset({"O", "I", "P"})
TWO_SOURCE_CAP = 4.0  # neither source above this for the dampened-questionable rule
NEAR_ZERO_CAP = 1.0  # listed, not zeroed, when RTS-only and 0 < proj < this


def _mtime_label(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, tz=UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def is_managed_note(note: object | None) -> bool:
    """DK-merge and RTS rows are owned by their importer; everything else is manual."""
    return str(note or "").strip().lower().startswith(("dk ", "rts"))


def parse_rts_csv(path: Path) -> list[dict]:
    df = pl.read_csv(Path(path), infer_schema_length=None)
    cols = {c.lower().strip(): c for c in df.columns}
    need = {"player:": "player", "position": "position", "team": "team",
            "salary": "salary", "projected points": "proj"}
    for want in need:
        if want not in cols:
            raise ValueError(f"RTS CSV needs a {want!r} column")
    out = []
    for row in df.iter_rows(named=True):
        raw = {k.lower().strip(): v for k, v in row.items()}
        player = "" if raw.get("player:") is None else str(raw["player:"]).strip()
        if not player:
            continue
        try:
            proj = float(raw.get("projected points"))
        except (TypeError, ValueError):
            continue
        try:
            salary = 0 if raw.get("salary") is None or str(raw["salary"]).strip() == "" \
                else int(float(str(raw["salary"]).strip()))
        except (TypeError, ValueError):
            salary = 0
        out.append({
            "player": player,
            "position": None if raw.get("position") in (None, "") else str(raw["position"]).strip(),
            "team": None if raw.get("team") in (None, "") else str(raw["team"]).strip(),
            "salary": salary,
            "proj": proj,
            "opp": None if raw.get("opp") in (None, "") else str(raw["opp"]).strip(),
        })
    return out


def parse_src2_csv(path: Path) -> list[dict]:
    df = pl.read_csv(Path(path), infer_schema_length=None)
    cols = {c.lower().strip(): c for c in df.columns}
    for want in ("player", "team", "position", "proj", "status"):
        if want not in cols:
            raise ValueError(f"second-source CSV needs a {want!r} column")
    out = []
    for row in df.iter_rows(named=True):
        raw = {k.lower().strip(): v for k, v in row.items()}
        player = "" if raw.get("player") is None else str(raw["player"]).strip()
        if not player:
            continue
        try:
            proj = float(raw.get("proj"))
        except (TypeError, ValueError):
            continue
        status = None if raw.get("status") in (None, "") else str(raw["status"]).strip().upper()
        out.append({
            "player": player,
            "position": None if raw.get("position") in (None, "") else str(raw["position"]).strip(),
            "team": None if raw.get("team") in (None, "") else str(raw["team"]).strip(),
            "proj": proj,
            "status": status or None,
        })
    return out


def _match_rows(rows: list[dict], catalog: pl.DataFrame, aliases: dict[str, str],
                teams: dict) -> tuple[dict[str, dict], list[dict]]:
    """Match rows; dedup by player_id keeping max proj. Returns (by_id, unmatched)."""
    catalog = catalog if "_dn" in catalog.columns else N.prepare_catalog(catalog)
    by_id: dict[str, dict] = {}
    unmatched: list[dict] = []
    for row in rows:
        pos = N.normalize_pos(row.get("position"))
        if pos not in SKILL_POS:
            continue
        m = N.match_one(row, catalog, aliases, teams)
        if m.player_id is None:
            unmatched.append({**row, "reason": m.reason})
            continue
        prev = by_id.get(m.player_id)
        if prev is None or float(row.get("proj") or 0.0) > float(prev.get("proj") or 0.0):
            by_id[m.player_id] = {**row, "position": pos}
    return by_id, unmatched


def decide(rts_rows: list[dict], src2_rows: list[dict], catalog: pl.DataFrame,
           aliases: dict[str, str], teams: dict, week_teams: set[str],
           ours: dict[str, float], existing: dict[str, dict],
           mtime_label: str) -> dict:
    """Pure: source rows -> override actions. Never clears; never touches manual rows."""
    week_rows = [r for r in rts_rows
                 if N.normalize_team(r.get("team"), teams) in week_teams]
    off_week = [r for r in rts_rows if r not in week_rows]
    week_src2 = [r for r in src2_rows
                 if N.normalize_team(r.get("team"), teams) in week_teams]
    off_week += [r for r in src2_rows if r not in week_src2]

    rts_by_id, un_rts = _match_rows(week_rows, catalog, aliases, teams)
    src2_by_id, un_src2 = _match_rows(week_src2, catalog, aliases, teams)

    upserts: list[dict] = []
    protected: list[dict] = []
    already: list[dict] = []
    near_zero: list[dict] = []
    skipped_qb_zero: list[dict] = []

    for pid in sorted(set(rts_by_id) | set(src2_by_id)):
        rts = rts_by_id.get(pid)
        s2 = src2_by_id.get(pid)
        name = (rts or s2 or {}).get("player")
        pos = (rts or s2 or {}).get("position")
        rts_proj = None if rts is None else float(rts.get("proj") or 0.0)
        s2_proj = None if s2 is None else float(s2.get("proj") or 0.0)
        letter = None if s2 is None else s2.get("status")
        prefix = "rts+src2" if (rts is not None and s2 is not None) else "rts"

        status: str | None = None
        mult = 0.0
        note = ""
        if letter in OUT_LETTERS:
            status, mult = "out", 0.0
            note = f"{prefix} {letter} {mtime_label}"
        elif letter == "D":
            status, mult = "doubtful", 0.0
            note = f"{prefix} D {mtime_label}"
        elif (rts is not None and s2 is not None and rts_proj <= TWO_SOURCE_CAP
                and s2_proj <= TWO_SOURCE_CAP and pid in ours
                and rts_proj < ours[pid] and s2_proj < ours[pid]):
            mean = (rts_proj + s2_proj) / 2.0
            status, mult = "questionable", max(0.1, mean / ours[pid])
            note = f"rts+src2 q {rts_proj:.1f}/{s2_proj:.1f} {mtime_label}"
        elif (rts is not None and pos in ZERO_OUT_POS
                and rts_proj == 0.0 and int(rts.get("salary") or 0) > 0):
            status, mult = "out", 0.0
            note = f"rts 0 proj {mtime_label}"
        elif rts is not None and pos == "QB" and rts_proj == 0.0:
            skipped_qb_zero.append({**rts, "player_id": pid})
            continue
        elif (rts is not None and s2 is None and 0.0 < rts_proj < NEAR_ZERO_CAP
                and int(rts.get("salary") or 0) > 0):
            near_zero.append({**rts, "player_id": pid})
            continue
        else:
            continue

        ex = existing.get(pid)
        change = {"player_id": pid, "name": name, "old": None if not ex else ex.get("status"),
                  "new": status, "note": None if not ex else ex.get("note")}
        if ex and not is_managed_note(ex.get("note")):
            if ex.get("status") != status:
                protected.append({**change, "would": "upsert"})
            else:
                already.append(change)
            continue
        if ex and ex.get("status") == status and (ex.get("note") or "") == note:
            already.append(change)
            continue
        upserts.append({"player_id": pid, "name": name, "status": status,
                        "usage_multiplier": mult, "note": note,
                        "old": None if not ex else ex.get("status")})

    return {"upserts": upserts, "protected": protected, "already": already,
            "unmatched": un_rts + un_src2, "near_zero": near_zero,
            "skipped_qb_zero": skipped_qb_zero,
            "off_week": [{"player": r.get("player"), "team": r.get("team"),
                          "position": r.get("position")} for r in off_week]}


def load_week_teams(season: int, week: int) -> set[str]:
    df = read_sql(
        "select home_team as team from raw.schedules where season = %s and week = %s "
        "and game_type = 'REG' union select away_team from raw.schedules "
        "where season = %s and week = %s and game_type = 'REG'",
        (season, week, season, week),
    )
    return {str(r["team"]) for r in df.to_dicts() if r.get("team")}


def load_ours(season: int, week: int) -> dict[str, float]:
    runs = read_sql(
        "select run_id from model.sim_runs where season = %s and week = %s "
        "order by created_at desc limit 1",
        (season, week),
    )
    if runs.is_empty():
        return {}
    rid = runs.to_dicts()[0]["run_id"]
    df = read_sql(
        "select player_id, fpts_dk_mean::float8 as f from model.proj_players "
        "where run_id = %s and fpts_dk_mean is not null",
        (rid,),
    )
    return {str(r["player_id"]): float(r["f"]) for r in df.to_dicts() if r.get("player_id")}


def load_existing(season: int, week: int) -> dict[str, dict]:
    df = read_sql(
        "select player_id, status, note from raw.player_overrides "
        "where season = %s and week = %s",
        (season, week),
    )
    return {str(r["player_id"]): {"status": r.get("status"), "note": r.get("note")}
            for r in df.to_dicts() if r.get("player_id")}


def _write_report(path: Path, summary: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        f"rts-status {summary['season']} wk{summary['week']}: "
        f"{summary['written']} written / {summary['rts_rows']} RTS rows"
        + (f" / {summary['src2_rows']} second-source rows" if summary["second"] else ""),
        f"second source: {summary['second'] or 'none'}",
        "",
    ]
    for u in summary["upserts"]:
        lines.append(f"  {u['status']} x{u['usage_multiplier']}: {u['name']} "
                     f"({u['player_id']}) [{u['note']}]")
    for p in summary["protected"]:
        lines.append(f"  protected-manual: {p.get('name')} ({p['player_id']}) "
                     f"would {p.get('would', 'upsert')} note={p.get('note')}")
    for q in summary["skipped_qb_zero"]:
        lines.append(f"  qb-zero-skipped (share defect, not injury): {q.get('player')} "
                     f"team={q.get('team')}")
    for n in summary["near_zero"]:
        lines.append(f"  near-zero listed, not zeroed: {n.get('player')} "
                     f"{n.get('proj'):.2f} team={n.get('team')} pos={n.get('position')}")
    for u in summary["unmatched"]:
        lines.append(f"  {u.get('reason', 'unmatched')}: {u.get('player')} "
                     f"team={u.get('team')} pos={u.get('position')}")
    for o in summary["off_week"]:
        lines.append(f"  off-week team, skipped: {o.get('player')} team={o.get('team')}")
    path.write_text("\n".join(lines) + "\n")


def run(season: int, week: int, path: Path, second: Path | None = None) -> dict:
    path = Path(path)
    if not path.exists():
        raise ValueError(f"RTS file not found: {path}")
    rts_rows = parse_rts_csv(path)
    src2_rows: list[dict] = []
    if second is not None:
        second = Path(second)
        if not second.exists():
            raise ValueError(f"second-source file not found: {second}")
        src2_rows = parse_src2_csv(second)

    from .overrides import load_catalog
    catalog = load_catalog()
    teams, aliases = N.load_teams(), N.load_aliases()
    week_teams = load_week_teams(season, week)
    if not week_teams:
        raise ValueError(f"no REG games in raw.schedules for {season} week {week}")
    label = _mtime_label(path)
    d = decide(rts_rows, src2_rows, catalog, aliases, teams, week_teams,
               load_ours(season, week), load_existing(season, week), label)

    written = 0
    if d["upserts"]:
        frame = pl.DataFrame(d["upserts"]).with_columns(
            pl.lit(season).alias("season"),
            pl.lit(week).alias("week"),
        ).select(["season", "week", "player_id", "status", "usage_multiplier", "note"])
        written = write_overrides(frame)

    dest = DATA_DIR / "benchmarks" / f"rts_projections_{season}_week{week:02d}.csv"
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, dest)

    summary = {"season": season, "week": week, "path": str(path),
               "second": None if second is None else str(second),
               "rts_rows": len(rts_rows), "src2_rows": len(src2_rows),
               "written": written, "upserts": d["upserts"],
               "protected": d["protected"], "unmatched": d["unmatched"],
               "near_zero": d["near_zero"], "skipped_qb_zero": d["skipped_qb_zero"],
               "off_week": d["off_week"], "csv": str(dest)}
    _write_report(ROOT / "output" / f"rts_status_{season}_{week}.txt", summary)
    return summary
