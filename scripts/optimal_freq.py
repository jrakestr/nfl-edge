"""Optimal-frequency prototype: how often is each player in the optimal lineup across sim draws?

Re-solves the DK classic MILP once per sampled draw using that draw's correlated `fpts_dk`
(every game's draw k is the same world: QB and WR1 move together, RB and opposing DST
move apart). The count per player, over draws, is "optimal in X% of worlds"; joined to
`model.dfs_exposure` it reads against the field.

Read-only on the DB. Writes one CSV next to the slate's other files and nothing else.

    uv run python scripts/optimal_freq.py --run <run_id> --slate main --draws 300
"""
from __future__ import annotations

import argparse
import csv
import sys
import time
from pathlib import Path

import numpy as np
import polars as pl

from nfl_edge.config import DATA_DIR, ROOT
from nfl_edge.db import read_sql
from nfl_edge.dfs import cross_slate as cs

SALARY_CAP = 50_000


def run_meta(run_prefix: str) -> dict:
    rows = read_sql(
        "select run_id::text, season, week from model.sim_runs where run_id::text like %s",
        (f"{run_prefix}%",),
    ).to_dicts()
    if len(rows) != 1:
        raise RuntimeError(f"run prefix {run_prefix!r} matches {len(rows)} runs; need exactly 1")
    return rows[0]


def draws_matrix(run_id: str, player_ids: list[str]) -> np.ndarray:
    """players x draws of fpts_dk, in `player_ids` order. Fails if any player has no draws."""
    paths = read_sql(
        "select player_id, draws_path from model.proj_players where run_id = %s",
        (run_id,),
    ).to_dicts()
    path_by_pid = {str(r["player_id"]): str(r["draws_path"]) for r in paths if r.get("draws_path")}
    wanted = set(player_ids)
    missing = sorted(wanted - set(path_by_pid))
    if missing:
        raise RuntimeError(f"{len(missing)} slate players have no draws_path: {missing[:8]}")
    by_path: dict[str, list[str]] = {}
    for pid in player_ids:
        by_path.setdefault(path_by_pid[pid], []).append(pid)

    cols: dict[str, np.ndarray] = {}
    n_draws: int | None = None
    for rel, pids in by_path.items():
        pq = ROOT / rel
        if not pq.is_file():
            raise RuntimeError(f"draws missing at {rel}")
        df = (
            pl.read_parquet(pq, columns=["player_id", "draw_no", "fpts_dk"])
            .filter(pl.col("player_id").is_in(pids))
            .sort(["player_id", "draw_no"])
        )
        for pid, grp in df.group_by("player_id", maintain_order=True):
            arr = grp["fpts_dk"].to_numpy().astype(float)
            if n_draws is None:
                n_draws = arr.size
            elif arr.size != n_draws:
                raise RuntimeError(f"{pid[0]} has {arr.size} draws, expected {n_draws}")
            cols[str(pid[0])] = arr
    gone = [p for p in player_ids if p not in cols]
    if gone:
        raise RuntimeError(f"no draw rows for {gone[:8]}")
    return np.vstack([cols[p] for p in player_ids])


def ownership(run_id: str, site: str, slate_id: str) -> dict[str, dict]:
    rows = read_sql(
        "select player_id, own_field_proj::float8 as own_field_proj, "
        "own_field_sim::float8 as own_field_sim, own_ours::float8 as own_ours "
        "from model.dfs_exposure where run_id = %s and site = %s and slate_id = %s",
        (run_id, site, slate_id),
    ).to_dicts()
    return {str(r["player_id"]): r for r in rows}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", required=True, help="run_id or unique prefix")
    ap.add_argument("--slate", default="main")
    ap.add_argument("--site", default="dk")
    ap.add_argument("--draws", type=int, default=300, help="sampled draws (one MILP each)")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default=None, help="CSV path (default: data/dfs/<run>/<site>/<slate>/optimal_freq.csv)")
    args = ap.parse_args(argv)

    meta = run_meta(args.run)
    run_id = str(meta["run_id"])
    slate_id = f"{int(meta['season'])}_{int(meta['week']):02d}_{args.slate}"

    pool, _sources = cs.load_pool(slate_id, [run_id], site=args.site)
    players = pool.players
    if not players:
        raise RuntimeError(f"empty pool for {slate_id}")
    pids = [p["player_id"] for p in players]
    t0 = time.monotonic()
    M = draws_matrix(run_id, pids)
    t_load = time.monotonic() - t0
    n_total = M.shape[1]
    if args.draws > n_total:
        raise RuntimeError(f"asked for {args.draws} draws but the run has {n_total}")
    rng = np.random.default_rng(args.seed)
    picks = rng.choice(n_total, size=args.draws, replace=False)

    counts = np.zeros(len(players), dtype=int)
    solve_times: list[float] = []
    for k, d in enumerate(picks, 1):
        score = M[:, d].tolist()
        t1 = time.monotonic()
        idx = cs._solve(players, score, salary_cap=SALARY_CAP, banned=set(), prior=[],
                        min_diff=0, stack=False)
        solve_times.append(time.monotonic() - t1)
        if idx is None:
            raise RuntimeError(f"draw {d}: no feasible lineup")
        counts[idx] += 1
        if k % 50 == 0:
            print(f"  {k}/{args.draws} draws, {np.mean(solve_times):.2f}s per solve", file=sys.stderr)

    own = ownership(run_id, args.site, slate_id)
    out_path = Path(args.out) if args.out else DATA_DIR / "dfs" / run_id / args.site / args.slate / "optimal_freq.csv"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    rows = []
    for p, c in zip(players, counts):
        o = own.get(p["player_id"], {})
        freq = c / args.draws
        sim = o.get("own_field_sim")
        rows.append({
            "player_id": p["player_id"], "name": p["name"], "pos": p["pos"], "team": p["team"],
            "salary": p["salary"], "mean": round(p["mean"], 2),
            "optimal_pct": round(100 * freq, 1),
            "own_ours_pct": "" if o.get("own_ours") is None else round(100 * float(o["own_ours"]), 1),
            "own_field_proj_pct": "" if o.get("own_field_proj") is None else round(100 * float(o["own_field_proj"]), 1),
            "own_field_sim_pct": "" if sim is None else round(100 * float(sim), 1),
            "leverage_vs_sim": "" if sim is None else round(100 * (freq - float(sim)), 1),
        })
    rows.sort(key=lambda r: (-r["optimal_pct"], -r["mean"]))
    with out_path.open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    total = time.monotonic() - t0
    print(f"optimal-freq {slate_id} run {run_id[:8]}: {args.draws} draws over {len(players)} players")
    print(f"  load {t_load:.1f}s, solve {sum(solve_times):.1f}s "
          f"({np.mean(solve_times):.2f}s/draw), total {total:.1f}s")
    print(f"  {sum(1 for c in counts if c)} players optimal at least once; "
          f"ownership rows joined: {sum(1 for p in players if p['player_id'] in own)}/{len(players)}")
    print(f"  -> {out_path}")
    print(f"  {'player':<24}{'pos':<5}{'sal':>6}{'mean':>7}{'opt%':>7}{'sim%':>7}{'proj%':>7}{'lev':>7}")
    for r in rows[:20]:
        print(f"  {r['name'][:23]:<24}{r['pos']:<5}{r['salary']:>6}{r['mean']:>7}"
              f"{r['optimal_pct']:>7}{r['own_field_sim_pct']:>7}{r['own_field_proj_pct']:>7}{r['leverage_vs_sim']:>7}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RuntimeError as e:
        print(f"error: {e}", file=sys.stderr)
        sys.exit(1)
