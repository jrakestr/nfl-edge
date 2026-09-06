"""Write the NFL-DFS-Tools working dir from the same sim draws.

Own% v1 (until contest results exist — dfs-refine): equal blend of inverse salary
rank and inverse projection rank among the slate. Rank 1 is highest. Mapped onto
0.5–30.0 so the tool never sees a 0 (it rewrites 0 to 0.1). Formula:

    score = 0.5 * (n - salary_rank + 1) / n + 0.5 * (n - proj_rank + 1) / n
    own%  = 0.5 + 29.5 * score

Unprojected slate players keep a row (Fpts=0) and are listed in report.txt. The
optimizer drops Fpts < projection_minimum except DST; that omission is reported,
not silent.
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

from ..config import CONFIG_DIR, DATA_DIR
from ..db import read_sql

PROJ_COLS = ["Name", "Position", "Team", "Salary", "Fpts", "Own%", "StdDev"]
PLAYER_ID_COLS = [
    "Position", "Name + ID", "Name", "ID", "Roster Position", "Salary", "Game Info", "TeamAbbrev",
]
# Matches config/dfs/dk_classic.json. Optimizer skips Fpts below this except DST.
PROJECTION_MINIMUM = 5.0


def own_pct_v1(salary_rank: int, proj_rank: int, n: int) -> float:
    if n <= 0:
        return 0.5
    inv_s = (n - salary_rank + 1) / n
    inv_p = (n - proj_rank + 1) / n
    return 0.5 + 29.5 * (0.5 * inv_s + 0.5 * inv_p)


def map_position(pos: str | None) -> str:
    raw = "" if pos is None else str(pos).strip().upper()
    if raw in {"D", "DEF"}:
        return "DST"
    return raw


def _fnum(v: object, default: float = 0.0) -> float:
    if v is None or v == "":
        return default
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def _ranks(values: list[float]) -> list[int]:
    """1 = highest. Ties keep distinct sequential ranks."""
    order = sorted(range(len(values)), key=lambda i: values[i], reverse=True)
    ranks = [0] * len(values)
    for r, i in enumerate(order, start=1):
        ranks[i] = r
    return ranks


def _unique_slate(slate: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out = []
    for row in slate:
        dk = str(row.get("player_dk_id") or "")
        if not dk or dk in seen:
            continue
        seen.add(dk)
        out.append(row)
    return out


def build_projections(
    slate: list[dict], proj: dict[str, dict], site: str = "dk",
) -> tuple[list[dict], list[dict]]:
    mean_key = "fpts_fd_mean" if site == "fd" else "fpts_dk_mean"
    sd_key = "fpts_fd_sd" if site == "fd" else "fpts_dk_sd"
    players = _unique_slate(slate)
    n = len(players)
    fpts = []
    for row in players:
        pid = row.get("player_id")
        stats = proj.get(pid) if pid else None
        if stats is None:
            fpts.append(float("-inf"))
        else:
            fpts.append(_fnum(stats.get(mean_key)))
    sal_ranks = _ranks([_fnum(r.get("salary")) for r in players])
    proj_ranks = _ranks(fpts)
    out, report = [], []
    for i, row in enumerate(players):
        pid = row.get("player_id")
        stats = proj.get(pid) if pid else None
        pos = map_position(row.get("position"))
        if stats is None:
            mean, sd = 0.0, 0.0
            report.append({
                "kind": "unprojected", "name": row.get("name"), "team": row.get("team"),
                "position": pos, "player_id": pid,
            })
        else:
            mean, sd = _fnum(stats.get(mean_key)), _fnum(stats.get(sd_key))
        if mean < PROJECTION_MINIMUM and pos != "DST":
            report.append({
                "kind": "below_projection_minimum", "name": row.get("name"),
                "team": row.get("team"), "position": pos, "fpts": mean,
            })
        out.append({
            "Name": row.get("name") or "",
            "Position": pos,
            "Team": row.get("team") or "",
            "Salary": int(_fnum(row.get("salary"))),
            "Fpts": mean,
            "Own%": round(own_pct_v1(sal_ranks[i], proj_ranks[i], n), 1),
            "StdDev": sd,
        })
    return out, report


def build_player_ids(slate: list[dict]) -> list[dict]:
    rows = []
    for r in slate:
        name = r.get("name") or ""
        dk_id = str(r.get("player_dk_id") or "")
        salary = r.get("salary")
        rows.append({
            "Position": r.get("position") or "",
            "Name + ID": f"{name} ({dk_id})" if dk_id else name,
            "Name": name,
            "ID": dk_id,
            "Roster Position": r.get("roster_position") or "",
            "Salary": "" if salary is None else int(_fnum(salary)),
            "Game Info": r.get("game_info") or "",
            "TeamAbbrev": r.get("team") or "",
        })
    return rows


def build_correlations(corr: list[dict], names: dict[str, str]) -> dict[str, dict[str, float]]:
    out: dict[str, dict[str, float]] = {}
    for row in corr:
        a = names.get(row.get("player_id_a"))
        b = names.get(row.get("player_id_b"))
        if not a or not b or a == b:
            continue
        val = _fnum(row.get("corr_dk"))
        out.setdefault(a, {})[b] = val
        out.setdefault(b, {})[a] = val
    return out


def build_config(corr: list[dict], names: dict[str, str]) -> dict:
    cfg = json.loads((CONFIG_DIR / "dfs" / "dk_classic.json").read_text())
    cfg["custom_correlations"] = build_correlations(corr, names)
    return cfg


def write_export(
    out_dir: Path,
    projections: list[dict],
    player_ids: list[dict],
    config: dict,
    report: list[dict] | None = None,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    with (out_dir / "projections.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=PROJ_COLS)
        w.writeheader()
        w.writerows(projections)
    with (out_dir / "player_ids.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=PLAYER_ID_COLS)
        w.writeheader()
        w.writerows(player_ids)
    (out_dir / "config.json").write_text(json.dumps(config, indent=2) + "\n")
    structure = CONFIG_DIR / "dfs" / "contest_structure.csv"
    if structure.exists():
        (out_dir / "contest_structure.csv").write_text(structure.read_text())
    lines = [
        f"projections {len(projections)}  player_ids {len(player_ids)}",
        "",
    ]
    for r in report or []:
        extra = f" fpts={r['fpts']}" if "fpts" in r else ""
        lines.append(
            f"  {r['kind']}: {r.get('name')} team={r.get('team')} pos={r.get('position')}{extra}"
        )
    (out_dir / "report.txt").write_text("\n".join(lines) + "\n")


def export_dir(run_id: str, site: str, slate: str) -> Path:
    return DATA_DIR / "dfs" / run_id / site / slate


def run(run_id: str, site: str = "dk", slate: str = "main") -> dict:
    meta = read_sql(
        "select run_id::text, season, week from model.sim_runs where run_id = %s",
        (run_id,),
    )
    if meta.is_empty():
        raise RuntimeError(f"no sim run {run_id}")
    season, week = int(meta[0, "season"]), int(meta[0, "week"])
    slate_id = f"{season}_{week:02d}_{slate}"
    salaries = read_sql(
        "select player_id, name, player_dk_id, position, roster_position, team, salary, game_info "
        "from raw.dk_salaries where site = %s and slate_id = %s",
        (site, slate_id),
    )
    if salaries.is_empty():
        raise RuntimeError(f"no raw.dk_salaries for site={site} slate_id={slate_id}")
    slate_rows = salaries.to_dicts()
    proj_rows = read_sql(
        "select player_id, fpts_dk_mean::float8 as fpts_dk_mean, fpts_dk_sd::float8 as fpts_dk_sd, "
        "fpts_fd_mean::float8 as fpts_fd_mean, fpts_fd_sd::float8 as fpts_fd_sd "
        "from model.proj_players where run_id = %s",
        (run_id,),
    )
    proj = {r["player_id"]: r for r in proj_rows.to_dicts() if r.get("player_id")}
    corr = read_sql(
        "select player_id_a, player_id_b, corr_dk::float8 as corr_dk "
        "from model.player_correlations where run_id = %s",
        (run_id,),
    ).to_dicts()
    names = {r["player_id"]: r["name"] for r in slate_rows if r.get("player_id") and r.get("name")}
    projections, report = build_projections(slate_rows, proj, site=site)
    ids = build_player_ids(slate_rows)
    cfg = build_config(corr, names)
    out = export_dir(run_id, site, slate)
    write_export(out, projections, ids, cfg, report)
    unmatched = [r for r in slate_rows if not r.get("player_id")]
    summary = {
        "run_id": run_id,
        "site": site,
        "slate": slate,
        "slate_id": slate_id,
        "path": str(out),
        "projections": len(projections),
        "player_ids": len(ids),
        "unprojected": sum(1 for r in report if r["kind"] == "unprojected"),
        "below_minimum": sum(1 for r in report if r["kind"] == "below_projection_minimum"),
        "unmatched_salaries": len(unmatched),
        "correlations": len(cfg["custom_correlations"]),
    }
    return summary
