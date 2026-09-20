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

import numpy as np

from ..config import CONFIG_DIR, DATA_DIR, load_yaml
from ..db import read_sql
from ..dfs import construction as C
from ..ingest.dk_salaries import slate_game_pairs
from ..sim import scoring

PROJ_COLS = ["Name", "Position", "Team", "Salary", "Fpts", "Own%", "StdDev"]
PLAYER_ID_COLS = [
    "Position", "Name + ID", "Name", "ID", "Roster Position", "Salary", "Game Info", "TeamAbbrev",
]
# Matches config/dfs/dk_classic.json. Optimizer skips Fpts below this except DST.
PROJECTION_MINIMUM = 5.0
INJURY_OUT = frozenset({"out", "ir", "doubtful"})


def uniques_from_config(cfg: dict) -> int:
    return max(1, int(cfg.get("num_uniques") or 3))


def exposure_cap_count(max_exposure: float, lineups: int) -> int:
    """Same floor as the browser optimizer: floor(pct/100 * n)."""
    return int((float(max_exposure) / 100.0) * max(1, int(lineups)))


def exposure_for_slate(base: float, n_games: int, n_lineups: int) -> int:
    """40% of 150 locks the only stacks on a 2-game slate before 150 lineups."""
    cap = int(base)
    if int(n_games) <= 2 and int(n_lineups) >= 100:
        return max(cap, 80)
    return cap


def settings_from_config(cfg: dict, construction: str = "mass") -> dict:
    stacks = float(cfg.get("pct_field_using_stacks") or 0)
    stacks_pct = round(stacks * 100) if stacks <= 1 else int(stacks)
    return {
        "construction": construction,
        "randomness": int(cfg.get("randomness") or 0),
        "stacks_pct": stacks_pct,
        "max_exposure": int(cfg.get("max_exposure") or 40),
        "num_uniques": uniques_from_config(cfg),
    }


def drop_injured(
    slate: list[dict],
    proj: dict[str, dict],
    overrides: dict[str, str],
    site: str = "dk",
) -> tuple[list[dict], list[dict]]:
    """Remove current OUT/IR/doubtful. Floor is not an injury filter."""
    mean_key = "fpts_fd_mean" if site == "fd" else "fpts_dk_mean"
    kept, dropped, seen = [], [], set()
    for row in slate:
        pid = row.get("player_id")
        status = overrides.get(pid) if pid else None
        if not status or str(status).strip().lower() not in INJURY_OUT:
            kept.append(row)
            continue
        if pid in seen:
            continue
        seen.add(pid)
        stats = proj.get(pid) or {}
        dropped.append({
            "kind": "injury_out",
            "name": row.get("name"),
            "team": row.get("team"),
            "position": map_position(row.get("position")),
            "player_id": pid,
            "status": str(status),
            "fpts": _fnum(stats.get(mean_key)),
        })
    return kept, dropped


def captain_fpts(fpts: float, site: str = "dk") -> float:
    """CPT points from scoring.yaml. The showdown optimizer applies this itself; do not pre-multiply export Fpts."""
    rules = load_yaml("scoring.yaml")
    return float(scoring.captain(np.array([fpts], dtype=float), rules, site)[0])


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


def _flex_slate(slate: list[dict]) -> list[dict]:
    """One projection row per person. Prefer FLEX salary; the tool multiplies CPT 1.5×."""
    by_key: dict[str, dict] = {}
    for row in slate:
        key = str(row.get("player_id") or "") or f"{row.get('name')}|{row.get('team')}"
        rp = (row.get("roster_position") or "").strip().upper()
        prev = by_key.get(key)
        if prev is None or (rp == "FLEX" and (prev.get("roster_position") or "").strip().upper() != "FLEX"):
            by_key[key] = row
    return list(by_key.values())


def build_projections(
    slate: list[dict], proj: dict[str, dict], site: str = "dk",
    showdown: bool = False,
    construction: dict | None = None,
) -> tuple[list[dict], list[dict]]:
    mean_key = "fpts_fd_mean" if site == "fd" else "fpts_dk_mean"
    sd_key = "fpts_fd_sd" if site == "fd" else "fpts_dk_sd"
    players = _flex_slate(slate) if showdown else _unique_slate(slate)
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
        if construction is not None and stats is not None:
            fpts = C.adjusted_fpts(
                mean,
                stats.get("p25"),
                stats.get("p90"),
                stats.get("own"),
                construction,
            )
        else:
            fpts = mean
        if fpts < PROJECTION_MINIMUM and pos != "DST":
            report.append({
                "kind": "below_projection_minimum", "name": row.get("name"),
                "team": row.get("team"), "position": pos, "fpts": fpts,
            })
        out.append({
            "Name": row.get("name") or "",
            "Position": pos,
            "Team": row.get("team") or "",
            "Salary": int(_fnum(row.get("salary"))),
            "Fpts": fpts,
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


def build_config(corr: list[dict], names: dict[str, str], showdown: bool = False) -> dict:
    fname = "dk_showdown.json" if showdown else "dk_classic.json"
    cfg = json.loads((CONFIG_DIR / "dfs" / fname).read_text())
    cfg["custom_correlations"] = build_correlations(corr, names)
    return cfg


def write_export(
    out_dir: Path,
    projections: list[dict],
    player_ids: list[dict],
    config: dict,
    report: list[dict] | None = None,
    showdown: bool = False,
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
    fname = "dk_showdown_contest.csv" if showdown else "contest_structure.csv"
    structure = CONFIG_DIR / "dfs" / fname
    if structure.exists():
        (out_dir / "contest_structure.csv").write_text(structure.read_text())
    lines = [
        f"projections {len(projections)}  player_ids {len(player_ids)}",
        "",
    ]
    for r in report or []:
        extra = f" fpts={r['fpts']}" if "fpts" in r else ""
        status = f" status={r['status']}" if r.get("status") else ""
        lines.append(
            f"  {r['kind']}: {r.get('name')} team={r.get('team')} pos={r.get('position')}{status}{extra}"
        )
    (out_dir / "report.txt").write_text("\n".join(lines) + "\n")


def export_dir(run_id: str, site: str, slate: str) -> Path:
    return DATA_DIR / "dfs" / run_id / site / slate


def run(
    run_id: str,
    site: str = "dk",
    slate: str = "main",
    lineups: int = 150,
    construction: str = "mass",
) -> dict:
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
        "fpts_fd_mean::float8 as fpts_fd_mean, fpts_fd_sd::float8 as fpts_fd_sd, "
        "(stat_summary -> 'fpts_ppr' ->> 'p25')::float8 as p25, "
        "(stat_summary -> 'fpts_ppr' ->> 'p90')::float8 as p90 "
        "from model.proj_players where run_id = %s",
        (run_id,),
    )
    proj = {r["player_id"]: r for r in proj_rows.to_dicts() if r.get("player_id")}
    own_rows = read_sql(
        "select player_id, own_field_proj::float8 as own "
        "from model.dfs_exposure where run_id = %s and site = %s and slate_id = %s",
        (run_id, site, slate_id),
    )
    for r in own_rows.to_dicts():
        pid = r.get("player_id")
        if pid and pid in proj:
            proj[pid]["own"] = r.get("own")
    ov = read_sql(
        "select player_id, status from raw.player_overrides "
        "where season = %s and week = %s "
        "and lower(status) in ('out', 'ir', 'doubtful')",
        (season, week),
    )
    overrides = {
        str(r["player_id"]): str(r["status"])
        for r in ov.to_dicts() if r.get("player_id") and r.get("status")
    }
    slate_rows, injury_dropped = drop_injured(slate_rows, proj, overrides, site=site)
    corr = read_sql(
        "select player_id_a, player_id_b, corr_dk::float8 as corr_dk "
        "from model.player_correlations where run_id = %s",
        (run_id,),
    ).to_dicts()
    names = {r["player_id"]: r["name"] for r in slate_rows if r.get("player_id") and r.get("name")}
    showdown = slate.strip().lower() == "showdown"
    prof = C.profile(slate, construction)
    projections, report = build_projections(
        slate_rows, proj, site=site, showdown=showdown, construction=prof,
    )
    report = injury_dropped + report
    ids = build_player_ids(slate_rows)
    cfg = C.apply_to_tools_config(
        build_config(corr, names, showdown=showdown), prof, showdown=showdown,
    )
    n_games = len(slate_game_pairs([str(r.get("game_info") or "") for r in slate_rows]))
    if construction == "mass":
        cfg["max_exposure"] = exposure_for_slate(cfg.get("max_exposure") or 40, n_games, lineups)
    out = export_dir(run_id, site, slate)
    write_export(out, projections, ids, cfg, report, showdown=showdown)
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
        "injury_dropped": injury_dropped,
        "unmatched_salaries": len(unmatched),
        "correlations": len(cfg["custom_correlations"]),
        "construction": construction,
        "settings": settings_from_config(cfg, construction),
        "mean_by_dk": {
            str(r["player_dk_id"]): _fnum((proj.get(r.get("player_id")) or {}).get(
                "fpts_fd_mean" if site == "fd" else "fpts_dk_mean"
            ))
            for r in slate_rows
            if r.get("player_dk_id") and r.get("player_id") and r.get("player_id") in proj
        },
    }
    return summary
