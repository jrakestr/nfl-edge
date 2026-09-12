"""Ingest a DraftKings salary export into raw.dk_salaries and injury Status into raw.player_overrides."""
from __future__ import annotations

from pathlib import Path

import polars as pl

from ..config import DATA_DIR, ROOT
from ..db import execute, read_sql, upsert
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
               teams: dict) -> list[dict]:
    catalog = N.prepare_catalog(catalog)
    out = []
    for row in rows:
        m = N.match_one(
            {"player": row["name"], "team": row.get("team"), "position": row.get("position")},
            catalog, aliases, teams,
        )
        out.append({**row, "player_id": m.player_id, "match_reason": m.reason})
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
    for s in summary["override_skipped"]:
        lines.append(
            f"  override-{s.get('reason')}: {s.get('name')} "
            f"team={s.get('team')} status={s.get('status')}"
        )
    path.write_text("\n".join(lines) + "\n")


def run(season: int, week: int, path: Path, site: str = "dk", slate: str = "main") -> dict:
    slate_id = f"{season}_{week:02d}_{slate}"
    slate_type = slate_type_for(slate)
    rows = attach_ids(parse_dk_csv(path), load_catalog(), N.load_aliases(), N.load_teams())
    frame = salary_frame(rows, site=site, slate_id=slate_id, slate_type=slate_type)
    written = 0
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
    ov_rows, ov_skipped = overrides_from_status(rows)
    ov_written = 0
    if ov_rows:
        ov = pl.DataFrame(ov_rows).with_columns(
            pl.lit(season).alias("season"),
            pl.lit(week).alias("week"),
        ).select(["season", "week", "player_id", "status", "usage_multiplier", "note"])
        ov_written = write_overrides(ov)
    unmatched = [r for r in rows if r.get("player_id") is None]
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
    }
    _write_report(ROOT / "output" / f"dk_salaries_{slate_id}.txt", summary)
    return summary
