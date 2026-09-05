"""Vectorized fantasy scoring from config/scoring.yaml. Applied to every draw.

score_offense(stats, rules) -> {"dk", "fd", "ppr"}; score_dst(stats, rules) -> array.
PPR = DK rules without yardage bonuses and with INT/fumble at -2 (standard full-PPR).
Captain multiplier is exposed via `captain()` but unused in this slice.
"""
from __future__ import annotations

import numpy as np

OFF_KEYS = ("pass_yds", "pass_td", "int", "rush_yds", "rush_td", "rec", "rec_yds", "rec_td",
            "fum_lost", "two_pt")


def _site(stats: dict[str, np.ndarray], r: dict, bonuses: bool) -> np.ndarray:
    pts = (
        stats["pass_yds"] * r["pass_yd"] + stats["pass_td"] * r["pass_td"] + stats["int"] * r["int"]
        + stats["rush_yds"] * r["rush_yd"] + stats["rush_td"] * r["rush_td"]
        + stats["rec"] * r["rec"] + stats["rec_yds"] * r["rec_yd"] + stats["rec_td"] * r["rec_td"]
        + stats["fum_lost"] * r["fumble_lost"] + stats["two_pt"] * r["two_pt"]
    )
    if bonuses:
        pts = pts + (stats["pass_yds"] >= 300) * r.get("pass_300_bonus", 0)
        pts = pts + (stats["rush_yds"] >= 100) * r.get("rush_100_bonus", 0)
        pts = pts + (stats["rec_yds"] >= 100) * r.get("rec_100_bonus", 0)
    return np.asarray(pts, dtype=float)


def score_offense(stats: dict[str, np.ndarray], rules: dict) -> dict[str, np.ndarray]:
    s = {k: np.asarray(stats.get(k, 0), dtype=float) for k in OFF_KEYS}
    ppr_rules = {**rules["dk"], "int": -2, "fumble_lost": -2}
    return {
        "dk": _site(s, rules["dk"], bonuses=True),
        "fd": _site(s, rules["fd"], bonuses=False),
        "ppr": _site(s, ppr_rules, bonuses=False),
    }


def points_allowed_pts(pts_allowed: np.ndarray, brackets: list[dict]) -> np.ndarray:
    pa = np.asarray(pts_allowed, dtype=float)
    out = np.full(pa.shape, np.nan)
    for b in sorted(brackets, key=lambda b: b["max"], reverse=True):
        out = np.where(pa <= b["max"], b["pts"], out)
    return out


def score_dst(stats: dict[str, np.ndarray], rules: dict) -> np.ndarray:
    r = rules["dst"]
    s = {k: np.asarray(stats.get(k, 0), dtype=float)
         for k in ("pts_allowed", "sacks", "int", "fum_rec", "td", "safety", "block_kick")}
    return (
        points_allowed_pts(s["pts_allowed"], r["points_allowed"])
        + s["sacks"] * r["sack"] + s["int"] * r["int"] + s["fum_rec"] * r["fumble_rec"]
        + s["td"] * r["td"] + s["safety"] * r["safety"] + s["block_kick"] * r["block_kick"]
    )


def captain(fpts: np.ndarray, rules: dict, site: str) -> np.ndarray:
    return fpts * rules[site].get("showdown_captain_multiplier", 1.5)
