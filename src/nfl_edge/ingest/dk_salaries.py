"""Ingest a DraftKings salary export into raw.dk_salaries and injury Status into raw.player_overrides."""
from __future__ import annotations

import re
from datetime import UTC, datetime
from pathlib import Path

import polars as pl

from ..config import DATA_DIR, ROOT
from ..db import execute, read_sql, upsert
from . import dk_crosswalk as X
from . import names as N
from .overrides import write_overrides

# DK's Status column. User spec: O/D/Q. The Week 1 export spells OUT and IR rather than O/D.
_STATUS = {
    "o": ("out", 0.0),
    "out": ("out", 0.0),
    "d": ("doubtful", 0.0),
    "q": ("questionable", 1.0),
    "ir": ("out", 0.0),
}
_DK_NOTE_PREFIX = "dk "
_GAME_INFO_RE = re.compile(
    r"^([A-Z]{2,3})@([A-Z]{2,3})\s+\d{2}/\d{2}/\d{4}\s+\d{1,2}:\d{2}[AP]M\s+ET$",
    re.IGNORECASE,
)


def default_path(season: int, week: int, slate: str = "main") -> Path:
    return DATA_DIR / "dk" / f"DKSalaries_{season}_wk{week:02d}_{slate}.csv"


def slate_type_for(slate: str) -> str:
    """Showdown slates only. `full` is the 16-game classic week, not showdown."""
    return "showdown" if slate.strip().lower() == "showdown" else "classic"


def map_dk_status(raw: object | None) -> tuple[str, float] | None:
    if raw is None:
        return None
    key = str(raw).strip().lower()
    if not key:
        return None
    return _STATUS.get(key)


def is_dk_note(note: object | None) -> bool:
    return str(note or "").strip().lower().startswith(_DK_NOTE_PREFIX)


def parse_game_info(raw: str | None) -> tuple[str, str] | None:
    if not raw:
        return None
    m = _GAME_INFO_RE.match(raw.strip())
    if not m:
        return None
    away, home = m.group(1).upper(), m.group(2).upper()
    return N.TEAM_ALIASES.get(away, away), N.TEAM_ALIASES.get(home, home)


def slate_game_pairs(game_infos: list[str]) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for raw in game_infos:
        pair = parse_game_info(raw)
        if pair and pair not in seen:
            seen.add(pair)
            out.append(pair)
    return out


def missing_run_pairs(
    pairs: list[tuple[str, str]],
    run_pairs: set[tuple[str, str]],
) -> list[tuple[str, str]]:
    return [p for p in pairs if p not in run_pairs]


def fmt_mtime(mtime: float) -> str:
    return datetime.fromtimestamp(mtime, tz=UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def week_dk_csvs(season: int, week: int) -> list[tuple[str, Path, float]]:
    prefix = f"DKSalaries_{season}_wk{week:02d}_"
    folder = DATA_DIR / "dk"
    out: list[tuple[str, Path, float]] = []
    for path in sorted(folder.glob(f"{prefix}*.csv")):
        slate = path.name.removeprefix(prefix).removesuffix(".csv")
        if not slate:
            continue
        out.append((slate, path, path.stat().st_mtime))
    return out


def order_status_files(
    files: list[tuple[str, Path, float]],
    status_from: str | None,
) -> list[tuple[str, Path, float]]:
    slates = {s for s, _, _ in files}
    if status_from:
        key = status_from.strip().lower()
        if key not in slates:
            have = ", ".join(sorted(slates)) or "none"
            raise ValueError(f"unknown --status-from {status_from}; have {have}")
        rest = sorted(
            [(s, p, m) for s, p, m in files if s != key],
            key=lambda x: (x[2], x[0]),
        )
        auth = [x for x in files if x[0] == key]
        return rest + auth
    return sorted(files, key=lambda x: (x[2], x[0]))


def winning_status(
    file_rows: list[tuple[str, float, list[dict]]],
) -> dict[str, dict]:
    """Walk files oldest→newest. Last listing of a player_id wins, including blank Status."""
    win: dict[str, dict] = {}
    for slate, mtime, rows in file_rows:
        seen: set[str] = set()
        for r in rows:
            pid = r.get("player_id")
            if not pid or pid in seen:
                continue
            seen.add(pid)
            win[pid] = {
                "player_id": pid,
                "name": r.get("name"),
                "mapped": map_dk_status(r.get("status")),
                "raw_status": r.get("status"),
                "slate": slate,
                "mtime": mtime,
            }
    return win


def decide_override_actions(
    winning: dict[str, dict],
    existing: dict[str, dict],
    authority_slate: str,
) -> dict:
    upserts: list[dict] = []
    clears: list[dict] = []
    protected: list[dict] = []
    held: list[dict] = []
    for pid, w in winning.items():
        ex = existing.get(pid)
        mapped = w["mapped"]
        change = {
            "player_id": pid,
            "name": w.get("name"),
            "old": None if not ex else ex.get("status"),
            "new": None if mapped is None else mapped[0],
            "slate": w["slate"],
            "mtime": w["mtime"],
            "note": None if not ex else ex.get("note"),
        }
        if w["slate"] != authority_slate and mapped is not None:
            held.append(change)
        if ex and not is_dk_note(ex.get("note")):
            if mapped is None:
                protected.append({**change, "would": "clear"})
            elif ex.get("status") != mapped[0]:
                protected.append({**change, "would": "upsert"})
            continue
        if mapped is None:
            if ex:
                clears.append({**change, "new": "cleared"})
            continue
        if not ex or ex.get("status") != mapped[0]:
            upserts.append(change)
    return {
        "upserts": upserts,
        "clears": clears,
        "protected": protected,
        "held": held,
    }


def _cell(raw: dict, key: str) -> str | None:
    v = raw.get(key)
    if v is None or str(v).strip() == "":
        return None
    return str(v).strip()


def parse_dk_csv(path: Path) -> list[dict]:
    df = pl.read_csv(path, infer_schema_length=None)
    df = df.rename({c: str(c).lstrip("\ufeff") for c in df.columns})
    cols = {c.lower().strip(): c for c in df.columns}
    for need in ("name", "id"):
        if need not in cols:
            raise ValueError(f"DK salary CSV needs a {need} column")
    out = []
    for row in df.iter_rows(named=True):
        raw = {k.lower().strip(): v for k, v in row.items()}
        name = "" if raw.get("name") is None else str(raw["name"]).strip()
        dk_id = "" if raw.get("id") is None else str(raw["id"]).strip()
        if not name or not dk_id:
            continue
        salary = raw.get("salary")
        try:
            salary_i = None if salary is None or str(salary).strip() == "" else int(salary)
        except (TypeError, ValueError):
            salary_i = None
        avg_raw = raw.get("avgpointspergame")
        try:
            avg_points = None if avg_raw is None or str(avg_raw).strip() == "" else float(avg_raw)
        except (TypeError, ValueError):
            avg_points = None
        status = raw.get("status")
        status_s = None if status is None or str(status).strip() == "" else str(status).strip()
        out.append({
            "name": name,
            "player_dk_id": dk_id,
            "roster_position": _cell(raw, "roster position") or "",
            "team": _cell(raw, "teamabbrev"),
            "game_info": _cell(raw, "game info"),
            "salary": salary_i,
            "avg_points": avg_points,
            "position": _cell(raw, "position"),
            "status": status_s,
        })
    return out


def attach_ids(rows: list[dict], catalog: pl.DataFrame, aliases: dict[str, str],
               teams: dict, existing: dict[str, str] | None = None,
               recent_ids: set[str] | None = None) -> list[dict]:
    out, _ = X.apply_to_rows(
        rows, catalog, teams, existing=existing, aliases=aliases, recent_ids=recent_ids,
    )
    return out


def overrides_from_status(rows: list[dict]) -> tuple[list[dict], list[dict]]:
    ov, skipped = [], []
    seen: set[str] = set()
    for row in rows:
        mapped = map_dk_status(row.get("status"))
        raw = row.get("status")
        if mapped is None:
            if raw:
                skipped.append({**row, "reason": "unmapped_status"})
            continue
        status, mult = mapped
        if not row.get("player_id"):
            skipped.append({**row, "reason": row.get("match_reason") or "unmatched"})
            continue
        pid = row["player_id"]
        if pid in seen:
            continue
        seen.add(pid)
        ov.append({
            "player_id": pid,
            "status": status,
            "usage_multiplier": mult,
            "note": f"dk {raw}",
        })
    return ov, skipped


def salary_frame(rows: list[dict], site: str, slate_id: str, slate_type: str) -> pl.DataFrame:
    schema = {
        "site": pl.Utf8, "slate_id": pl.Utf8, "slate_type": pl.Utf8,
        "player_dk_id": pl.Utf8, "name": pl.Utf8, "position": pl.Utf8,
        "roster_position": pl.Utf8, "team": pl.Utf8, "salary": pl.Int64,
        "avg_points": pl.Float64, "game_info": pl.Utf8, "player_id": pl.Utf8,
    }
    recs = [{
        "site": site,
        "slate_id": slate_id,
        "slate_type": slate_type,
        "player_dk_id": r["player_dk_id"],
        "name": r["name"],
        "position": r.get("position"),
        "roster_position": r.get("roster_position") or "",
        "team": r.get("team"),
        "salary": r.get("salary"),
        "avg_points": r.get("avg_points"),
        "game_info": r.get("game_info"),
        "player_id": r.get("player_id"),
    } for r in rows]
    return pl.DataFrame(recs, schema=schema) if recs else pl.DataFrame(schema=schema)


def load_catalog() -> pl.DataFrame:
    return read_sql(
        "select gsis_id, display_name, merge_name, latest_team, position from raw.players"
    )


def load_week_overrides(season: int, week: int) -> dict[str, dict]:
    df = read_sql(
        "select player_id, status, note from raw.player_overrides "
        "where season = %s and week = %s",
        (season, week),
    )
    return {
        r["player_id"]: {"status": r.get("status"), "note": r.get("note")}
        for r in df.to_dicts() if r.get("player_id")
    }


def attach_csv(
    path: Path,
    catalog: pl.DataFrame,
    teams: dict,
    aliases: dict[str, str],
    existing: dict[str, str] | None,
    recent_ids: set[str] | None,
) -> tuple[list[dict], list[dict]]:
    return X.apply_to_rows(
        parse_dk_csv(path), catalog, teams,
        existing=existing, aliases=aliases, recent_ids=recent_ids,
    )


def merge_week_status(
    season: int,
    week: int,
    catalog: pl.DataFrame,
    teams: dict,
    aliases: dict[str, str],
    existing_xwalk: dict[str, str] | None,
    recent_ids: set[str] | None,
    status_from: str | None = None,
) -> tuple[list[tuple[str, Path, float]], dict[str, dict], dict]:
    files = week_dk_csvs(season, week)
    ordered = order_status_files(files, status_from)
    file_rows: list[tuple[str, float, list[dict]]] = []
    for slate, path, mtime in ordered:
        rows, _ = attach_csv(path, catalog, teams, aliases, existing_xwalk, recent_ids)
        file_rows.append((slate, mtime, rows))
    winning = winning_status(file_rows)
    authority = ordered[-1][0] if ordered else ""
    existing = load_week_overrides(season, week)
    actions = decide_override_actions(winning, existing, authority)
    return ordered, winning, actions


def apply_status_actions(
    season: int, week: int, actions: dict, winning: dict[str, dict],
) -> int:
    n = 0
    clear_ids = [c["player_id"] for c in actions["clears"]]
    if clear_ids:
        n += execute(
            "delete from raw.player_overrides "
            "where season = %s and week = %s and player_id = any(%s)",
            (season, week, clear_ids),
        )
    recs = []
    for ch in actions["upserts"]:
        w = winning[ch["player_id"]]
        status, mult = w["mapped"]
        raw = w.get("raw_status") or status
        recs.append({
            "player_id": ch["player_id"],
            "status": status,
            "usage_multiplier": mult,
            "note": f"dk {w['slate']} {raw}",
        })
    if recs:
        ov = pl.DataFrame(recs).with_columns(
            pl.lit(season).alias("season"),
            pl.lit(week).alias("week"),
        ).select(["season", "week", "player_id", "status", "usage_multiplier", "note"])
        n += write_overrides(ov)
    return n


def format_merge_lines(ordered: list[tuple[str, Path, float]], actions: dict) -> list[str]:
    lines = ["status files (mtime is arrival on disk, not DK export):"]
    for slate, path, mtime in ordered:
        lines.append(f"  {slate}  {fmt_mtime(mtime)}  {path}")
    lines.append("status changes:")
    changes = actions["upserts"] + actions["clears"]
    if not changes:
        lines.append("  (none)")
    for c in changes:
        lines.append(
            f"  {c['player_id']}  {c.get('name')}  {c.get('old')} -> {c.get('new')}  "
            f"{c['slate']}  {fmt_mtime(c['mtime'])}"
        )
    lines.append("protected (non-DK note, not written):")
    if not actions["protected"]:
        lines.append("  (none)")
    for p in actions["protected"]:
        lines.append(
            f"  {p['player_id']}  {p.get('name')}  would {p.get('would')}  "
            f"note={p.get('note')}  {p['slate']}"
        )
    lines.append("held by other file (authoritative file does not list them):")
    if not actions["held"]:
        lines.append("  (none)")
    for h in actions["held"]:
        lines.append(
            f"  {h['player_id']}  {h.get('name')}  {h.get('new')}  "
            f"{h['slate']}  {fmt_mtime(h['mtime'])}"
        )
    return lines


def _write_report(path: Path, summary: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        (
            f"dk salaries {summary['site']} {summary['slate_id']}: "
            f"{summary['written']} written / {summary['rows']} rows, "
            f"{summary['matched']} matched, {summary['unmatched_n']} unmatched, "
            f"{summary['overrides_written']} overrides"
        ),
        "",
    ]
    for u in summary["unmatched"]:
        lines.append(
            f"  {u.get('reason', 'unmatched')}: {u.get('name')} "
            f"team={u.get('team')} pos={u.get('position')} status={u.get('status')}"
        )
    for s in summary.get("override_skipped") or []:
        lines.append(
            f"  override-{s.get('reason')}: {s.get('name')} "
            f"team={s.get('team')} status={s.get('status')}"
        )
    lines.extend(summary.get("merge_lines") or [])
    path.write_text("\n".join(lines) + "\n")


def run(
    season: int,
    week: int,
    path: Path,
    site: str = "dk",
    slate: str = "main",
    dry_run: bool = False,
    status_from: str | None = None,
    salaries_only: bool = False,
    merge_only: bool = False,
) -> dict:
    slate_id = f"{season}_{week:02d}_{slate}"
    slate_type = slate_type_for(slate)
    catalog = load_catalog()
    teams = N.load_teams()
    aliases = N.load_aliases()
    existing_xwalk = X.load_existing()
    recent_ids = X.load_recent_ids()
    rows: list[dict] = []
    new_xwalk: list[dict] = []
    if not merge_only:
        rows, new_xwalk = attach_csv(
            path, catalog, teams, aliases, existing_xwalk, recent_ids,
        )
    unmatched = [r for r in rows if r.get("player_id") is None]
    frame = salary_frame(rows, site=site, slate_id=slate_id, slate_type=slate_type)
    written = 0
    if not dry_run and not merge_only:
        X.persist_new(new_xwalk, skip_ids=X.load_manual_ids())
        if not frame.is_empty():
            written = upsert(frame, "raw.dk_salaries",
                             ["site", "slate_id", "player_dk_id", "roster_position"])
            execute(
                "update raw.players p set dk_id = s.player_dk_id "
                "from raw.dk_salaries s "
                "where s.site = %s and s.slate_id = %s and s.player_id = p.gsis_id "
                "and (p.dk_id is null or p.dk_id = '') "
                "and s.roster_position <> 'CPT'",
                (site, slate_id),
            )
    ov_rows, ov_skipped = overrides_from_status(rows) if rows else ([], [])
    ordered: list[tuple[str, Path, float]] = []
    winning: dict[str, dict] = {}
    actions: dict = {"upserts": [], "clears": [], "protected": [], "held": []}
    ov_written = 0
    if not salaries_only:
        ordered, winning, actions = merge_week_status(
            season, week, catalog, teams, aliases, existing_xwalk, recent_ids,
            status_from=status_from,
        )
        if not dry_run:
            ov_written = apply_status_actions(season, week, actions, winning)
    merge_lines = format_merge_lines(ordered, actions) if not salaries_only else []
    summary = {
        "path": str(path),
        "season": season,
        "week": week,
        "site": site,
        "slate": slate,
        "slate_id": slate_id,
        "rows": len(rows),
        "written": written,
        "matched": sum(1 for r in rows if r.get("player_id")),
        "unmatched_n": len(unmatched),
        "unmatched": unmatched,
        "overrides_written": ov_written,
        "override_skipped": ov_skipped,
        "overrides": ov_rows,
        "dry_run": dry_run,
        "status_files": [
            {"slate": s, "path": str(p), "mtime": fmt_mtime(m)} for s, p, m in ordered
        ],
        "override_changes": actions["upserts"] + actions["clears"],
        "protected": actions["protected"],
        "held": actions["held"],
        "merge_lines": merge_lines,
    }
    if not dry_run:
        _write_report(ROOT / "output" / f"dk_salaries_{slate_id}.txt", summary)
    return summary
