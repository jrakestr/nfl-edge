"""P(over) for manual prop lines from the same parquet draws the rest of the system reads.

Histogram in proj_players.stat_summary is display-only. Edge math matches market/edge.py:
model_prob is P(win | no push), market_prob is the two-way de-vig, Kelly is quarter-Kelly
at the offered price. PropCallout copy is persisted on model.prop_edges.
"""
from __future__ import annotations

import math
from collections import Counter
from pathlib import Path

import numpy as np
import polars as pl

from ..config import ROOT, load_yaml
from ..db import execute, insert, read_sql
from ..market.edge import (
    conditional_prob,
    devig_two_way,
    kelly,
    outcome_probs,
    prob_to_american,
)
from ..outputs.lines_io import resolve_run

STAT_LABELS = {
    "pass_yds": "passing yards",
    "pass_td": "passing TDs",
    "int": "interceptions",
    "rush_yds": "rushing yards",
    "rush_td": "rushing TDs",
    "rec": "receptions",
    "rec_yds": "receiving yards",
    "rec_td": "receiving TDs",
    "anytime_td": "anytime TDs",
}
FAIR_STATS = (
    "pass_yds", "pass_td", "int", "rush_yds", "rush_td", "rec", "rec_yds", "rec_td", "anytime_td",
)
MINUS = "\u2212"


def cfg() -> dict:
    return load_yaml("sim.yaml")["edge"]


def last_name(display_name: str) -> str:
    parts = (display_name or "").strip().split()
    if not parts:
        return display_name
    if len(parts) >= 2 and parts[-2].rstrip(".").lower() in {"st", "de", "la", "van", "von"}:
        return " ".join(parts[-2:])
    return parts[-1]


def round_to_half(x: float) -> float:
    """Always a hook: median 83.0 and 83.9 both become 83.5."""
    return math.floor(float(x)) + 0.5


def fair_line(values: np.ndarray) -> float:
    return round_to_half(float(np.median(np.asarray(values, dtype=float))))


def p_over_at(values: np.ndarray, line: float) -> float:
    return float((np.asarray(values, dtype=float) > float(line)).mean())


def anytime_td_prob(rush_td: np.ndarray, rec_td: np.ndarray) -> float:
    return float((np.asarray(rush_td, dtype=float) + np.asarray(rec_td, dtype=float) >= 1).mean())


def _quantiles(values: np.ndarray) -> dict[str, float]:
    q = np.percentile(np.asarray(values, dtype=float), [10, 25, 75, 90])
    return {"p10": float(q[0]), "p25": float(q[1]), "p75": float(q[2]), "p90": float(q[3])}


def fair_row(stat: str, values: np.ndarray, rec: np.ndarray | None = None) -> dict:
    if stat == "anytime_td":
        combo = np.asarray(values, dtype=float) + np.asarray(rec if rec is not None else 0, dtype=float)
        q = _quantiles(combo)
        return {
            "stat": stat, "fair_line": 0.5, "p_over": float((combo >= 1).mean()),
            **q, "mean": float(combo.mean()),
        }
    arr = np.asarray(values, dtype=float)
    line = fair_line(arr)
    return {
        "stat": stat, "fair_line": line, "p_over": p_over_at(arr, line),
        **_quantiles(arr), "mean": float(arr.mean()),
    }


def fair_callout(stat: str, fair_line: float, mean: float, p10: float, p90: float,
                 p_over: float | None = None) -> str:
    if stat == "anytime_td":
        p = min(0.99, max(0.01, float(p_over or 0.0)))
        amer = round(float(prob_to_american(p)))
        return f"Our fair price is {_price_str(amer)}."
    return (
        f"Our line is {float(fair_line):g}; the typical game lands at {mean:.0f}; "
        f"one in ten under {p10:.0f}, one in ten over {p90:.0f}"
    )


def _price_str(a: int) -> str:
    return (MINUS + str(abs(int(a)))) if int(a) < 0 else "+" + str(int(a))


def stat_draws(cols: dict[str, np.ndarray], stat: str) -> np.ndarray:
    if stat == "anytime_td":
        return np.asarray(cols["rush_td"], dtype=float) + np.asarray(cols["rec_td"], dtype=float)
    if stat == "rush_rec":
        return np.asarray(cols["rush_yds"], dtype=float) + np.asarray(cols["rec_yds"], dtype=float)
    return np.asarray(cols[stat], dtype=float)


def lean(over_edge: float, flat: float) -> str:
    if abs(over_edge) < flat:
        return "flat"
    return "over" if over_edge > 0 else "under"


def callout(display_name: str, stat: str, line: float, p_over: float,
            over_odds: int, market_prob: float, draws: int) -> str:
    name = last_name(display_name)
    label = STAT_LABELS.get(stat, stat.replace("_", " "))
    line_s = f"{line:g}"
    n = f"{int(draws):,}"
    return (
        f"{name} goes over {line_s} {label} in {p_over:.0%} of our {n} simulated games. "
        f"At {_price_str(over_odds)} the book is pricing it like a {market_prob:.0%} shot."
    )


def _odds(v, default: int) -> int:
    return default if v is None else int(v)


def edge_row(values: np.ndarray, line: float, over_odds: int | None, under_odds: int | None,
             cfg: dict) -> dict:
    default = int(cfg["default_price"])
    pr_over, pr_under = _odds(over_odds, default), _odds(under_odds, default)
    win, push, lose = outcome_probs(values, float(line))
    p_over_cond = conditional_prob(win, push)
    p_under_cond = conditional_prob(lose, push)
    m_over, hold = devig_two_way(pr_over, pr_under)
    m_under = 1.0 - m_over
    mult = float(cfg["kelly_multiplier"])
    e_over = p_over_cond - m_over
    e_under = p_under_cond - m_under
    return {
        "p_over": win,
        "p_push": push,
        "model_prob": p_over_cond,
        "market_prob": m_over,
        "edge": e_over,
        "kelly_fraction": kelly(p_over_cond, push, pr_over, mult),
        "price": pr_over,
        "hold": hold,
        "lean": lean(e_over, float(cfg["flat_edge"])),
        "under": {
            "model_prob": p_under_cond,
            "market_prob": m_under,
            "edge": e_under,
            "kelly_fraction": kelly(p_under_cond, push, pr_under, mult),
            "price": pr_under,
        },
    }


def _player_cols(path: Path, player_id: str, stat: str) -> dict[str, np.ndarray] | None:
    need = ["player_id"]
    if stat == "anytime_td":
        need += ["rush_td", "rec_td"]
    elif stat == "rush_rec":
        need += ["rush_yds", "rec_yds"]
    else:
        need.append(stat)
    pq = ROOT / path
    if not pq.exists():
        return None
    df = pl.read_parquet(pq, columns=need).filter(pl.col("player_id") == player_id)
    if df.is_empty():
        return None
    return {c: df[c].to_numpy() for c in df.columns if c != "player_id"}


def compute(run_id: str, props: list[dict], names: dict[str, str], draws_n: int,
            paths: dict[str, str], games: dict[str, str], c: dict) -> tuple[list[dict], list[dict]]:
    rows, skipped = [], []
    for p in props:
        pid, stat = p["player_id"], p["stat"]
        path = paths.get(pid)
        if not path:
            skipped.append({**p, "reason": "no_proj"})
            continue
        cols = _player_cols(path, pid, stat)
        if cols is None:
            skipped.append({**p, "reason": "no_draws"})
            continue
        try:
            vals = stat_draws(cols, stat)
        except KeyError:
            skipped.append({**p, "reason": "bad_stat"})
            continue
        er = edge_row(vals, float(p["line"]), p.get("over_odds"), p.get("under_odds"), c)
        display = names.get(pid) or p.get("player_name") or pid
        sentence = callout(
            display, stat, float(p["line"]), er["p_over"], er["price"], er["market_prob"], draws_n,
        )
        base = {
            "run_id": run_id,
            "market_prop_id": p["id"],
            "player_id": pid,
            "game_id": games.get(pid),
            "stat": stat,
            "line": float(p["line"]),
            "p_over": er["p_over"],
            "p_push": er["p_push"],
            "hold": er["hold"],
            "sentence": sentence,
            "lean": er["lean"],
        }
        rows.append({
            **base, "side": "over",
            "model_prob": er["model_prob"], "market_prob": er["market_prob"],
            "edge": er["edge"], "kelly_fraction": er["kelly_fraction"], "price": er["price"],
        })
        u = er["under"]
        rows.append({
            **base, "side": "under",
            "model_prob": u["model_prob"], "market_prob": u["market_prob"],
            "edge": u["edge"], "kelly_fraction": u["kelly_fraction"], "price": u["price"],
        })
    return rows, skipped


def persist(run_id: str, rows: list[dict]) -> int:
    execute("delete from model.prop_edges where run_id = %s", (run_id,))
    if not rows:
        return 0
    cols = [
        "run_id", "market_prop_id", "player_id", "game_id", "stat", "line", "side",
        "model_prob", "p_over", "p_push", "market_prob", "edge", "kelly_fraction",
        "price", "hold", "sentence", "lean",
    ]
    frame = pl.DataFrame([{k: r.get(k) for k in cols} for r in rows])
    return insert(frame, "model.prop_edges")


def load_week_props(season: int, week: int) -> list[dict]:
    """Newest snapshot per (player_id, stat) for the week."""
    return read_sql(
        """
        select distinct on (player_id, stat)
               id, player_id, player_name, stat, line::float8 as line,
               over_odds, under_odds, captured_at
        from model.market_props
        where season = %s and week = %s and player_id is not null
        order by player_id, stat, captured_at desc, id desc
        """,
        (season, week),
    ).to_dicts()


def run(season: int, week: int, run_id: str | None = None) -> dict:
    meta = resolve_run(season, week, run_id)
    rid = meta["run_id"]
    draws_n = int(meta["draws_per_game"] or 0)
    props = load_week_props(season, week)
    if not props:
        return {"run_id": rid, "n_props": 0, "n_edges": 0, "skipped": []}
    pids = [p["player_id"] for p in props]
    loc = read_sql(
        "select player_id, game_id, draws_path from model.proj_players "
        "where run_id = %s and player_id = any(%s)",
        (rid, pids),
    )
    paths = {r["player_id"]: r["draws_path"] for r in loc.to_dicts()}
    games = {r["player_id"]: r["game_id"] for r in loc.to_dicts()}
    names = {p["player_id"]: p["player_name"] for p in props}
    display = read_sql(
        "select gsis_id, display_name from raw.players where gsis_id = any(%s)",
        (pids,),
    )
    for r in display.to_dicts():
        if r.get("display_name"):
            names[r["gsis_id"]] = r["display_name"]
    rows, skipped = compute(rid, props, names, draws_n, paths, games, cfg())
    n = persist(rid, rows)
    return {"run_id": rid, "n_props": len(props), "n_edges": n, "skipped": skipped}


def persist_fair(run_id: str, rows: list[dict]) -> int:
    execute("delete from model.fair_props where run_id = %s", (run_id,))
    if not rows:
        return 0
    cols = [
        "run_id", "player_id", "stat", "fair_line", "p_over", "p10", "p25", "p75", "p90", "mean", "sentence",
    ]
    frame = pl.DataFrame([{k: r.get(k) for k in cols} for r in rows])
    return insert(frame, "model.fair_props")


def fair_props(run_id: str) -> dict:
    """Median-hook fair line for every offensive player-stat on the run. From parquet, not the hist."""
    loc = read_sql(
        "select player_id, game_id, position, draws_path from model.proj_players where run_id = %s",
        (run_id,),
    )
    if loc.is_empty():
        persist_fair(run_id, [])
        return {"run_id": run_id, "n_rows": 0, "by_stat": {}}
    by_path: dict[str, list[dict]] = {}
    for r in loc.to_dicts():
        if r.get("position") == "DST" or not r.get("draws_path"):
            continue
        by_path.setdefault(r["draws_path"], []).append(r)
    need = ["player_id", "pass_yds", "pass_td", "int", "rush_yds", "rush_td", "rec", "rec_yds", "rec_td"]
    out: list[dict] = []
    for path, plist in by_path.items():
        pq = ROOT / path
        if not pq.exists():
            continue
        wanted = [r["player_id"] for r in plist]
        df = pl.read_parquet(pq, columns=need).filter(pl.col("player_id").is_in(wanted))
        if df.is_empty():
            continue
        for part in df.partition_by("player_id"):
            pid = str(part["player_id"][0])
            rush = part["rush_td"].to_numpy()
            rec_td = part["rec_td"].to_numpy()
            for stat in FAIR_STATS:
                if stat == "anytime_td":
                    row = fair_row(stat, rush, rec=rec_td)
                else:
                    row = fair_row(stat, part[stat].to_numpy())
                row.update({
                    "run_id": run_id,
                    "player_id": pid,
                    "sentence": fair_callout(
                        stat, row["fair_line"], row["mean"], row["p10"], row["p90"], row["p_over"],
                    ),
                })
                out.append(row)
    n = persist_fair(run_id, out)
    by_stat = dict(Counter(r["stat"] for r in out))
    return {"run_id": run_id, "n_rows": n, "by_stat": by_stat}
