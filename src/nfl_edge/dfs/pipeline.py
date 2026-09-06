"""One-slate DFS build: export this slate's IDs, optimize, simulate, persist."""
from __future__ import annotations

from pathlib import Path

import polars as pl

from ..config import DATA_DIR
from ..db import execute, insert, read_sql
from ..ingest.dk_salaries import slate_type_for
from ..outputs import dfs_export
from ..outputs.lines_io import resolve_run
from . import parse, run_optimizer, run_sim


def persist(run_id: str, site: str, slate_id: str, slate_type: str,
            lineups: list[dict], exposure: list[dict]) -> dict:
    execute(
        "delete from model.dfs_lineups where run_id = %s and site = %s and slate_id = %s",
        (run_id, site, slate_id),
    )
    execute(
        "delete from model.dfs_exposure where run_id = %s and site = %s and slate_id = %s",
        (run_id, site, slate_id),
    )
    lu_rows = []
    for row in lineups:
        lu_rows.append({
            "run_id": run_id,
            "site": site,
            "slate_id": slate_id,
            "slate_type": slate_type,
            "lineup_id": row["lineup_id"],
            "lineup": parse.lineup_json(row),
            "proj_fpts": row.get("proj_fpts"),
            "sim_win_pct": row.get("win_pct"),
            "sim_roi": row.get("roi"),
            "salary_used": row.get("salary_used"),
            "stack": row.get("stack"),
        })
    n_lu = insert(pl.DataFrame(lu_rows), "model.dfs_lineups") if lu_rows else 0
    exp_rows = [{
        "run_id": run_id, "site": site, "slate_id": slate_id,
        "player_id": r["player_id"], "sim_own": r.get("sim_own"), "proj_own": r.get("proj_own"),
        "leverage": r.get("leverage"), "win_pct": r.get("win_pct"), "roi": r.get("roi"),
    } for r in exposure]
    n_exp = insert(pl.DataFrame(exp_rows), "model.dfs_exposure") if exp_rows else 0
    return {"lineups": n_lu, "exposure": n_exp}


def run(
    season: int,
    week: int,
    site: str = "dk",
    slate: str = "main",
    run_id: str | None = None,
    lineups: int = 150,
    field: int = 20000,
    export: Path | None = None,
) -> dict:
    meta = resolve_run(season, week, run_id)
    rid = meta["run_id"]
    slate_id = f"{season}_{week:02d}_{slate}"
    exported = dfs_export.run(rid, site, slate)
    export_dir = Path(exported["path"])
    salaries = read_sql(
        "select player_id, name, player_dk_id from raw.dk_salaries where site = %s and slate_id = %s",
        (site, slate_id),
    ).to_dicts()
    opto = run_optimizer.run(export_dir, site=site, lineups=lineups)
    sim = run_sim.run(export_dir, site=site, field=field, lineups_csv=Path(opto["path"]),
                      slate_rows=salaries)
    merged = parse.merge_sim_stats(opto["lineups"], sim["lineups"])
    written = persist(rid, site, slate_id, slate_type_for(slate), merged, sim["exposure"])
    upload = parse.upload_csv(merged, rid, slate_id)
    (export_dir / "dk_upload.csv").write_text(upload)
    if export:
        Path(export).write_text(upload)
    return {
        "run_id": rid,
        "site": site,
        "slate": slate,
        "slate_id": slate_id,
        "export_dir": str(export_dir),
        "n_lineups": len(merged),
        "n_exposure": len(sim["exposure"]),
        "persisted": written,
        "upload": str(export or export_dir / "dk_upload.csv"),
        "draw_root": str(DATA_DIR / "dfs" / rid / site / slate),
    }
