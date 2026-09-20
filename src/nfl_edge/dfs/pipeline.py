"""One-slate DFS build: export this slate's IDs, optimize, simulate, persist."""
from __future__ import annotations

from pathlib import Path

import polars as pl

from ..config import DATA_DIR
from ..db import execute, insert, read_sql
from ..ingest.dk_salaries import missing_run_pairs, slate_game_pairs, slate_type_for
from ..outputs import dfs_export
from ..outputs.lines_io import resolve_run
from . import construction as C
from . import parse, run_optimizer, run_sim


def persist(run_id: str, site: str, slate_id: str, slate_type: str,
            lineups: list[dict], exposure: list[dict],
            settings: dict | None = None,
            construction: str = "mass") -> dict:
    key = (construction or "mass").strip().lower()
    execute(
        "delete from model.dfs_lineups "
        "where run_id = %s and site = %s and slate_id = %s and construction = %s",
        (run_id, site, slate_id, key),
    )
    write_exposure = key == "mass"
    if write_exposure:
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
            "construction": key,
            "lineup_id": row["lineup_id"],
            "lineup": parse.lineup_json(row, settings),
            "proj_fpts": row.get("proj_fpts"),
            "sim_win_pct": row.get("win_pct"),
            "sim_roi": row.get("roi"),
            "salary_used": row.get("salary_used"),
            "stack": row.get("stack"),
        })
    n_lu = insert(pl.DataFrame(lu_rows), "model.dfs_lineups") if lu_rows else 0
    n_exp = 0
    if write_exposure:
        exp_rows = [{
            "run_id": run_id, "site": site, "slate_id": slate_id,
            "player_id": r["player_id"],
            "own_ours": r.get("own_ours"),
            "own_field_proj": r.get("own_field_proj"),
            "own_field_sim": r.get("own_field_sim"),
            "leverage": r.get("leverage"), "win_pct": r.get("win_pct"), "roi": r.get("roi"),
        } for r in exposure]
        n_exp = insert(pl.DataFrame(exp_rows), "model.dfs_exposure") if exp_rows else 0
    return {"lineups": n_lu, "exposure": n_exp}


def assert_slate_in_run(site: str, slate_id: str, run_id: str) -> None:
    infos = read_sql(
        "select distinct game_info from raw.dk_salaries "
        "where site = %s and slate_id = %s and game_info is not null",
        (site, slate_id),
    )
    raws = [str(r["game_info"]) for r in infos.to_dicts() if r.get("game_info")]
    if not raws:
        raise RuntimeError(f"no game_info on {slate_id}")
    pairs = slate_game_pairs(raws)
    if not pairs:
        raise RuntimeError(f"no parseable game_info on {slate_id}")
    run = read_sql(
        "select s.away_team, s.home_team "
        "from model.proj_games p "
        "join raw.schedules s on s.game_id = p.game_id "
        "where p.run_id = %s",
        (run_id,),
    )
    have = {
        (str(r["away_team"]), str(r["home_team"]))
        for r in run.to_dicts() if r.get("away_team") and r.get("home_team")
    }
    missing = missing_run_pairs(pairs, have)
    if missing:
        named = ", ".join(f"{a}@{h}" for a, h in missing)
        raise RuntimeError(f"slate {slate_id} games missing from run {run_id}: {named}")


def run(
    season: int,
    week: int,
    site: str = "dk",
    slate: str = "main",
    run_id: str | None = None,
    lineups: int | None = None,
    field: int = 20000,
    export: Path | None = None,
    construction: str = "mass",
) -> dict:
    meta = resolve_run(season, week, run_id)
    rid = meta["run_id"]
    slate_id = f"{season}_{week:02d}_{slate}"
    assert_slate_in_run(site, slate_id, rid)
    prof = C.profile(slate, construction)
    n_lineups = C.lineup_count(prof, lineups)
    exported = dfs_export.run(
        rid, site, slate, lineups=n_lineups, construction=construction,
    )
    export_dir = Path(exported["path"])
    settings = exported.get("settings")
    salaries = read_sql(
        "select player_id, name, player_dk_id from raw.dk_salaries where site = %s and slate_id = %s",
        (site, slate_id),
    ).to_dicts()
    showdown = slate_type_for(slate) == "showdown"
    opto = run_optimizer.run(export_dir, site=site, lineups=n_lineups, showdown=showdown)
    sim = run_sim.run(export_dir, site=site, field=field, lineups_csv=Path(opto["path"]),
                      slate_rows=salaries, showdown=showdown)
    merged = parse.merge_sim_stats(opto["lineups"], sim["lineups"])
    merged = parse.rescore_mean_fpts(
        merged, exported.get("mean_by_dk") or {}, showdown=showdown,
    )
    ours = parse.exposure_from_lineups(merged, salaries)
    field_proj = parse.field_proj_from_projections(export_dir / "projections.csv", salaries)
    exposure = parse.merge_exposure(sim["exposure"], ours, field_proj)
    written = persist(
        rid, site, slate_id, slate_type_for(slate), merged, exposure,
        settings=settings, construction=construction,
    )
    upload = parse.upload_csv(merged, rid, slate_id)
    upload_name = parse.upload_filename(slate_id, rid, "sim")
    upload_path = export_dir / upload_name
    upload_path.write_text(upload)
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
        "construction": construction,
        "persisted": written,
        "upload": str(export or upload_path),
        "draw_root": str(DATA_DIR / "dfs" / rid / site / slate),
        "injury_dropped": exported.get("injury_dropped") or [],
        "settings": settings,
    }
