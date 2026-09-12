"""Model vs market for game lines, keyed to the exact market snapshot.

For every (run_id, game_id, market_line_id) the game draws (`{game_id}.game.parquet`) are read
once and six rows are produced: spread home/away, total over/under, moneyline home/away.

Conventions
  nflverse `spread_line` is positive when the HOME team is favored; a home cover is
  `home_pts - away_pts > spread_line`. A push (margin == line, or a tie on the moneyline) refunds
  the stake, so `model_prob` is P(win | no push) — the same conditioning a de-vigged two-way
  market price carries. `proj_games.p_home_cover_market` counts a push as half; the parity check
  in `run` reconciles the two at the snapshot the simulator used.

  `edge = model_prob - market_prob` (both push-conditional). Kelly is taken at the price actually
  offered, so a positive edge smaller than the hold yields a zero stake.
"""
from __future__ import annotations

import logging

import numpy as np
import polars as pl

from ..config import ROOT, load_yaml
from ..db import execute, insert_ignore, read_sql

log = logging.getLogger(__name__)

EDGE_COLS = ["run_id", "market_type", "ref_id", "side", "model_prob", "market_prob", "edge",
             "kelly_fraction", "market_line_id", "price", "p_push", "hold"]
PARITY_TOL = 5e-4  # proj_games stores 4 decimals


def cfg() -> dict:
    return load_yaml("sim.yaml")["edge"]


# ----------------------------------------------------------------------------- odds math
def american_to_prob(a: float) -> float:
    a = float(a)
    return 100.0 / (a + 100.0) if a > 0 else -a / (-a + 100.0)


def prob_to_american(p: float) -> float:
    p = float(p)
    return -100.0 * p / (1.0 - p) if p >= 0.5 else 100.0 * (1.0 - p) / p


def decimal_odds(a: float) -> float:
    return 1.0 / american_to_prob(a)


def devig_two_way(a_side: float, a_other: float) -> tuple[float, float]:
    """Both-sides normalization. Returns (fair prob of `a_side`, hold)."""
    s, o = american_to_prob(a_side), american_to_prob(a_other)
    return s / (s + o), s + o - 1.0


# ----------------------------------------------------------------------------- outcome probabilities
def outcome_probs(values: np.ndarray, line: float) -> tuple[float, float, float]:
    """(P(values > line), P(values == line), P(values < line))."""
    v = np.asarray(values, dtype=float)
    win = float((v > line).mean())
    push = float((v == line).mean())
    return win, push, 1.0 - win - push


def conditional_prob(win: float, push: float) -> float:
    """P(win | no push)."""
    return win / (1.0 - push) if push < 1.0 else 0.5


def half_push_prob(win: float, push: float) -> float:
    """The proj_games convention: a push counts as half a cover."""
    return win + 0.5 * push


# Integer histograms cover at least these ranges so a half-point lookup never needs parquet.
SPREAD_LO, SPREAD_HI = -30, 30
TOTAL_LO, TOTAL_HI = 20, 80


def _int_hist(values: np.ndarray, lo: int, hi: int) -> dict:
    keys = np.rint(np.asarray(values, dtype=float)).astype(int)
    if keys.size:
        lo = int(min(lo, keys.min()))
        hi = int(max(hi, keys.max()))
    counts = [(keys == k).sum().item() for k in range(lo, hi + 1)]
    return {"lo": lo, "counts": counts}


def build_line_grid(margin: np.ndarray, total: np.ndarray) -> dict:
    """Compact integer histograms for live P(cover)/P(over) at any half-point line."""
    return {"margin": _int_hist(margin, SPREAD_LO, SPREAD_HI), "total": _int_hist(total, TOTAL_LO, TOTAL_HI)}


def lookup_line(hist: dict, line: float, spec_lo: float, spec_hi: float) -> tuple[float, float, float] | None:
    """(win, push, lose) matching outcome_probs. None when `line` is outside the published grid."""
    if line < spec_lo or line > spec_hi:
        return None
    counts = hist["counts"]
    n = sum(counts)
    if n == 0:
        return None
    win = push = 0
    lo = int(hist["lo"])
    for i, c in enumerate(counts):
        k = lo + i
        if k > line:
            win += c
        elif k == line:
            push += c
    win_p, push_p = win / n, push / n
    return win_p, push_p, 1.0 - win_p - push_p


def lookup_spread(grid: dict, line: float) -> tuple[float, float, float] | None:
    return lookup_line(grid["margin"], line, SPREAD_LO, SPREAD_HI)


def lookup_total(grid: dict, line: float) -> tuple[float, float, float] | None:
    return lookup_line(grid["total"], line, TOTAL_LO, TOTAL_HI)


def grid_from_parquet(path) -> dict:
    """Read `{game_id}.game.parquet` and build the line grid. Path is relative to ROOT or absolute."""
    from pathlib import Path

    p = Path(path)
    if not p.is_absolute():
        p = ROOT / p
    d = pl.read_parquet(p, columns=["home_pts", "away_pts"])
    margin = (d["home_pts"] - d["away_pts"]).to_numpy()
    total = (d["home_pts"] + d["away_pts"]).to_numpy()
    return build_line_grid(margin, total)


def kelly(model_prob: float, push: float, price: float, mult: float) -> float:
    """Kelly fraction at the offered price, clipped at zero and scaled by `mult`.

    A push returns the stake, so win/lose mass are both scaled by (1 - push).
    """
    b = decimal_odds(price) - 1.0
    win = model_prob * (1.0 - push)
    lose = (1.0 - model_prob) * (1.0 - push)
    f = (win * b - lose) / b
    return max(0.0, f) * mult


# ----------------------------------------------------------------------------- one snapshot
def _price(v, default: int) -> tuple[int, bool]:
    return (default, True) if v is None else (int(v), False)


def snapshot_edges(draws: pl.DataFrame, snap: dict, c: dict) -> list[dict]:
    """Six edge rows for one game at one market snapshot. Pure; `draws` needs home_pts/away_pts.

    Markets whose line is null are skipped. Null prices fall back to `c['default_price']`.
    """
    home = draws["home_pts"].to_numpy().astype(float)
    away = draws["away_pts"].to_numpy().astype(float)
    margin, total = home - away, home + away
    mult, default = float(c["kelly_multiplier"]), int(c["default_price"])

    markets: list[tuple[str, np.ndarray, float | None, str, str, object, object]] = [
        ("spread", margin, snap.get("spread_line"), "home", "away",
         snap.get("home_spread_odds"), snap.get("away_spread_odds")),
        ("total", total, snap.get("total_line"), "over", "under",
         snap.get("over_odds"), snap.get("under_odds")),
        ("moneyline", margin, 0.0 if snap.get("home_moneyline") is not None else None, "home", "away",
         snap.get("home_moneyline"), snap.get("away_moneyline")),
    ]
    rows: list[dict] = []
    for mt, arr, line, s_a, s_b, odds_a, odds_b in markets:
        if line is None:
            continue
        line = float(line)
        win, push, _lose = outcome_probs(arr, line)
        p_a = conditional_prob(win, push)
        pr_a, _ = _price(odds_a, default)
        pr_b, _ = _price(odds_b, default)
        m_a, hold = devig_two_way(pr_a, pr_b)
        for side, p, m, price in ((s_a, p_a, m_a, pr_a), (s_b, 1.0 - p_a, 1.0 - m_a, pr_b)):
            rows.append({
                "market_type": mt, "ref_id": snap["game_id"], "side": side,
                "model_prob": p, "market_prob": m, "edge": p - m,
                "kelly_fraction": kelly(p, push, price, mult),
                "market_line_id": snap.get("id"), "price": price, "p_push": push, "hold": hold,
            })
    return rows


# ----------------------------------------------------------------------------- run
def load_snapshots(game_ids: list[str]) -> pl.DataFrame:
    return read_sql(
        """
        select id, game_id, captured_at, spread_line::float8 as spread_line, total_line::float8 as total_line,
               home_moneyline, away_moneyline, home_spread_odds, away_spread_odds, over_odds, under_odds
        from raw.market_lines where game_id = any(%s) order by game_id, captured_at
        """,
        (game_ids,),
    )


def load_proj_games(run_id: str) -> pl.DataFrame:
    return read_sql(
        """
        select game_id, draws_path, market_spread::float8 as market_spread,
               p_home_cover_market::float8 as p_home_cover_market
        from model.proj_games where run_id = %s order by game_id
        """,
        (run_id,),
    )


def run(run_id: str, recompute: bool = False) -> dict:
    """Compute and persist edges for every market snapshot of every game in the run.

    Idempotent: rows already present for (run_id, market_line_id, market_type, side) are skipped.
    `recompute` deletes the run's edges and verdicts first.
    """
    c = cfg()
    if recompute:
        execute("delete from model.edges where run_id = %s", (run_id,))
        execute("delete from model.verdicts where run_id = %s", (run_id,))
    pg = load_proj_games(run_id)
    if pg.is_empty():
        raise RuntimeError(f"run {run_id} has no proj_games rows")
    snaps = load_snapshots(pg["game_id"].to_list())
    rows: list[dict] = []
    parity_checked = parity_ok = 0
    for g in pg.iter_rows(named=True):
        d = pl.read_parquet(ROOT / g["draws_path"], columns=["home_pts", "away_pts"])
        margin = (d["home_pts"] - d["away_pts"]).to_numpy().astype(float)
        matched = False
        for s in snaps.filter(pl.col("game_id") == g["game_id"]).iter_rows(named=True):
            rows.extend(snapshot_edges(d, s, c))
            if (g["market_spread"] is not None and s["spread_line"] is not None
                    and float(s["spread_line"]) == float(g["market_spread"]) and not matched):
                matched = True
                win, push, _ = outcome_probs(margin, float(s["spread_line"]))
                parity_checked += 1
                if abs(half_push_prob(win, push) - float(g["p_home_cover_market"])) <= PARITY_TOL:
                    parity_ok += 1
                else:
                    log.warning("parity mismatch %s: proj_games %.4f vs draws %.4f", g["game_id"],
                                g["p_home_cover_market"], half_push_prob(win, push))
        if not matched and g["market_spread"] is not None:
            log.warning("%s: no snapshot matches the run's market spread %.1f (line moved?)",
                        g["game_id"], g["market_spread"])
    if not rows:
        return {"edges": 0, "snapshots": 0, "parity": f"{parity_ok}/{parity_checked}"}
    df = pl.DataFrame(rows).with_columns(pl.lit(run_id).alias("run_id")).select(EDGE_COLS)
    n = insert_ignore(df, "model.edges")
    return {"edges": n, "rows": df.height, "snapshots": snaps.height, "games": pg.height,
            "parity": f"{parity_ok}/{parity_checked}"}
