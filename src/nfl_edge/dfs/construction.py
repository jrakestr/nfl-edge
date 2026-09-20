"""Named construction profiles. One JSON; NFL-DFS-Tools still maximizes Fpts."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np

from ..config import CONFIG_DIR, ROOT

CONSTRUCTIONS_PATH = CONFIG_DIR / "dfs" / "constructions.json"
IDS = ("cash", "single", "mass")
SLATES = ("classic", "showdown")


def load() -> dict[str, dict[str, dict[str, Any]]]:
    return json.loads(Path(CONSTRUCTIONS_PATH).read_text())


def profile(slate: str, construction: str) -> dict[str, Any]:
    kind = "showdown" if slate == "showdown" else "classic"
    key = (construction or "mass").strip().lower()
    data = load()
    if kind not in data or key not in data[kind]:
        raise ValueError(f"unknown construction {construction!r} for {slate}")
    return dict(data[kind][key])


def lineup_count(prof: dict[str, Any], override: int | None) -> int:
    n = int(override) if override is not None else int(prof["lineups"])
    hi = int(prof.get("lineups_max") or n)
    if n < 1:
        raise ValueError("lineups must be at least 1")
    if n > hi:
        raise ValueError(f"lineups {n} is above this construction's max {hi}")
    return n


def adjusted_fpts(
    mean: float,
    p25: float | None,
    p90: float | None,
    own: float | None,
    profile: dict[str, Any],
) -> float:
    obj = profile["objective"]
    if obj == "floor":
        if p25 is None:
            raise RuntimeError("This run has no 25th-percentile points; rebuild the sim.")
        return float(p25)
    if obj == "mean_ceiling_own":
        ceil = 0.0 if p90 is None else (float(p90) - float(mean))
        own_v = 0.0 if own is None else float(own)
        return (
            float(mean)
            + float(profile["ceiling_weight"]) * ceil
            - float(profile["ownership_penalty"]) * own_v
        )
    return float(mean)


def apply_to_tools_config(
    cfg: dict[str, Any],
    prof: dict[str, Any],
    *,
    showdown: bool = False,
) -> dict[str, Any]:
    """Overlay knobs NFL-DFS-Tools understands. No new objective key — Fpts carries it."""
    out = dict(cfg)
    out["randomness"] = int(prof["randomness"])
    out["min_lineup_salary"] = int(prof["min_lineup_salary"])
    out["max_exposure"] = int(prof["max_exposure"])
    uniques = prof.get("num_uniques")
    if uniques is None:
        out["num_uniques"] = max(1, int(prof.get("min_player_diff") or 1))
    else:
        out["num_uniques"] = int(uniques)
    if showdown:
        return out
    if int(prof.get("stack_n") or 0) == 0 and int(prof.get("bring_back") or 0) == 0:
        rules = dict(out.get("stack_rules") or {})
        rules["pair"] = []
        out["stack_rules"] = rules
    elif int(prof.get("stack_n") or 0) == 1:
        out["stack_rules"] = {
            "pair": [
                {"key": "QB", "positions": ["WR", "TE"], "count": 1, "type": "same-team", "exclude_teams": []},
                {"key": "QB", "positions": ["WR", "TE", "RB"], "count": 1, "type": "opp-team", "exclude_teams": []},
            ],
            "limit": (out.get("stack_rules") or {}).get("limit") or [],
        }
    return out


def merge_p25(summary: dict[str, Any], arr: np.ndarray) -> dict[str, Any]:
    """Write fpts_ppr.p25 from draws. Leaves other percentiles untouched."""
    out = dict(summary)
    fpts = dict(out.get("fpts_ppr") or {})
    fpts["p25"] = float(np.percentile(np.asarray(arr, dtype=float), 25))
    out["fpts_ppr"] = fpts
    return out


def backfill_p25_from_draws(run_id: str) -> int:
    """Fill missing p25 on proj_players from this run's player parquet."""
    import polars as pl

    from ..db import read_sql, update_from

    rows = read_sql(
        "select player_id, draws_path, stat_summary "
        "from model.proj_players where run_id = %s",
        (run_id,),
    )
    if rows.is_empty():
        return 0
    by_path: dict[str, list[dict[str, Any]]] = {}
    for r in rows.to_dicts():
        summary = r.get("stat_summary")
        if isinstance(summary, str):
            summary = json.loads(summary)
        if isinstance(summary, dict) and (summary.get("fpts_ppr") or {}).get("p25") is not None:
            continue
        path = r.get("draws_path")
        if not path or not r.get("player_id"):
            continue
        by_path.setdefault(str(path), []).append({**r, "stat_summary": summary})
    patched: list[dict[str, Any]] = []
    for rel, group in by_path.items():
        pq = ROOT / rel
        if not pq.is_file():
            raise RuntimeError(f"draws missing at {rel}; cannot backfill p25")
        df = pl.read_parquet(pq, columns=["player_id", "fpts_ppr"])
        wanted = {str(r["player_id"]) for r in group}
        for pid in wanted:
            arr = df.filter(pl.col("player_id") == pid)["fpts_ppr"].to_numpy()
            if arr.size == 0:
                raise RuntimeError(f"no draws for {pid} in {rel}")
            row = next(r for r in group if str(r["player_id"]) == pid)
            merged = merge_p25(row.get("stat_summary") or {}, arr)
            patched.append({
                "run_id": run_id,
                "player_id": pid,
                "stat_summary": merged,
            })
    if not patched:
        return 0
    return update_from(pl.DataFrame(patched), "model.proj_players", ["run_id", "player_id"])
