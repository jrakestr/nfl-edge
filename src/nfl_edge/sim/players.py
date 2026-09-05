"""Player allocation conditioned on one team's game draws.

Every player quantity is a split of a team quantity from the same draw, so player and game
outputs cannot disagree:
  targets  = multinomial(pass_att, Dirichlet(conc * target_share))       sum == pass_att
  rec_td   = multinomial(pass_td, rz_target_share * [targets > 0]), capped at targets   sum == pass_td
  rec      = rec_td + Bin(targets - rec_td, catch_rate')                 rec_td <= rec <= targets
  rec_yds  = round(Gamma(mean rec * yds_per_rec))
  carries  = multinomial(rush_att, Dirichlet(conc * carry_share))         sum == rush_att
  rush_td  = multinomial(rush_td, rz_carry_share * [carries > 0]), capped   sum == rush_td
  QB1      : pass_att = team pass_att, cmp = sum rec, pass_yds = sum rec_yds, pass_td = sum rec_td,
             int = team int
  fum_lost = Bin(carries + rec, fumble_lost_rate)
DST v1 (dst_stats): pts_allowed / sacks / int / fum_rec from the opponent's draws; defensive TDs,
safeties and blocked kicks are 0 because they would add points the game sim did not score.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import polars as pl

from .game import TeamDraws

SHARE_TOL = 1e-3
SHARE_COLS = ("target_share", "carry_share", "rz_target_share", "rz_carry_share")


@dataclass
class PlayerDraws:
    team: str
    player_ids: list[str]
    positions: list[str]
    pass_att: np.ndarray
    cmp: np.ndarray
    pass_yds: np.ndarray
    pass_td: np.ndarray
    int: np.ndarray
    carries: np.ndarray
    rush_yds: np.ndarray
    rush_td: np.ndarray
    targets: np.ndarray
    rec: np.ndarray
    rec_yds: np.ndarray
    rec_td: np.ndarray
    fum_lost: np.ndarray

    def stats(self, i: int) -> dict[str, np.ndarray]:
        """Offense stat dict for player i, shaped for scoring.score_offense."""
        return {
            "pass_yds": self.pass_yds[i], "pass_td": self.pass_td[i], "int": self.int[i],
            "rush_yds": self.rush_yds[i], "rush_td": self.rush_td[i], "rec": self.rec[i],
            "rec_yds": self.rec_yds[i], "rec_td": self.rec_td[i], "fum_lost": self.fum_lost[i],
            "two_pt": np.zeros_like(self.rec_td[i]),
        }


def validate_usage(usage: pl.DataFrame) -> None:
    """Shares must sum to 1 per team (target/carry; rz shares too when non-empty)."""
    sums = usage.group_by("team").agg([pl.col(c).sum() for c in SHARE_COLS])
    for row in sums.iter_rows(named=True):
        for c in SHARE_COLS:
            if abs(row[c] - 1.0) > SHARE_TOL:
                raise ValueError(f"{row['team']} {c} sums to {row[c]:.4f}, expected 1")
    qb = usage.group_by("team").agg(pl.col("is_qb1").sum())
    for row in qb.iter_rows(named=True):
        if row["is_qb1"] != 1:
            raise ValueError(f"{row['team']} has {row['is_qb1']} QB1 rows, expected exactly 1")


def _dirichlet_split(total: np.ndarray, share: np.ndarray, conc: float,
                     rng: np.random.Generator) -> np.ndarray:
    """(P, n) integer split of `total` (n,) by per-draw Dirichlet around `share` (P,)."""
    n = total.shape[0]
    P = share.shape[0]
    pos = share > 0
    out = np.zeros((P, n), dtype=np.int64)
    if not pos.any() or total.sum() == 0:
        return out
    alpha = np.maximum(share[pos] * conc, 1e-3)
    p = rng.dirichlet(alpha, size=n)                     # (n, k)
    out[pos] = rng.multinomial(total, p).T               # multinomial broadcasts n over rows
    return out


def _capped_split(total: np.ndarray, weight: np.ndarray, cap: np.ndarray,
                  rng: np.random.Generator, max_iter: int = 12) -> np.ndarray:
    """(P, n) multinomial split of `total` (n,) by `weight` (P, n), with out[p] <= cap[p].

    Excess over a player's cap is redistributed among players with headroom. If a draw has no
    headroom at all (total > sum(cap), essentially impossible), the excess stays on the last
    assignee so the sum still matches the team quantity.
    """
    P, n = weight.shape
    out = np.zeros((P, n), dtype=np.int64)
    w = weight.astype(float)
    remaining = total.astype(np.int64).copy()
    for _ in range(max_iter):
        active = remaining > 0
        if not active.any():
            break
        wa = w[:, active]
        s = wa.sum(axis=0)
        # draws with no eligible weight: fall back to uniform over players with headroom, else all
        zero = s <= 0
        if zero.any():
            head = (cap[:, active] - out[:, active]) > 0
            fb = np.where(head, 1.0, 0.0)
            none = fb.sum(axis=0) == 0
            fb[:, none] = 1.0
            wa = np.where(zero[None, :], fb, wa)
            s = wa.sum(axis=0)
        p = (wa / s).T                                    # (n_active, P)
        add = rng.multinomial(remaining[active], p).T     # (P, n_active)
        out[:, active] += add
        excess = np.maximum(out - cap, 0)
        out -= excess
        remaining = excess.sum(axis=0)
        # players at cap drop out of the weighting
        w = np.where(out >= cap, 0.0, w)
    if remaining.any():
        # no headroom anywhere: put the residual on the highest-weight player so sums still tie
        idx = np.argmax(weight, axis=0)
        out[idx[remaining > 0], np.where(remaining > 0)[0]] += remaining[remaining > 0]
    return out


def _gamma_yards(count: np.ndarray, mean_per: np.ndarray, shape_per: float,
                 rng: np.random.Generator) -> np.ndarray:
    """Integer yards with mean count * mean_per; Gamma with shape proportional to count."""
    k = count * shape_per
    scale = np.where(shape_per > 0, mean_per / shape_per, 0.0)
    y = np.zeros(count.shape, dtype=float)
    m = k > 0
    y[m] = rng.gamma(k[m], np.broadcast_to(scale, count.shape)[m])
    return np.round(y).astype(np.int64)


def allocate(team: TeamDraws, usage: pl.DataFrame, efficiency: pl.DataFrame, cfg: dict,
             rng: np.random.Generator) -> PlayerDraws:
    pc = cfg["players"]
    conc = float(pc.get("usage_concentration", 40))
    fum_rate = float(pc.get("fumble_lost_rate", 0.01))
    rec_shape = float(pc.get("yds_gamma_shape_per_rec", 1.0))
    car_shape = float(pc.get("yds_gamma_shape_per_carry", 0.8))

    u = usage.sort(["is_qb1", "target_share", "carry_share"], descending=True)
    u = u.join(efficiency.select(["player_id", "catch_rate", "yds_per_rec", "yds_per_carry"]),
               on="player_id", how="left")
    ids = u["player_id"].to_list()
    pos = u["position"].to_list() if "position" in u.columns else [""] * len(ids)
    P, n = len(ids), team.pts.shape[0]

    def col(c: str, d: float) -> np.ndarray:
        return u[c].fill_null(d).to_numpy().astype(float)

    tgt_share, car_share = col("target_share", 0.0), col("carry_share", 0.0)
    rz_t, rz_c = col("rz_target_share", 0.0), col("rz_carry_share", 0.0)
    catch_rate = np.clip(col("catch_rate", 0.65), 0.2, 0.95)[:, None]
    ypr, ypc = col("yds_per_rec", 11.0)[:, None], col("yds_per_carry", 4.2)[:, None]

    # receiving
    targets = _dirichlet_split(team.pass_att, tgt_share, conc, rng)
    # RZ share is the prior for who scores; the count only gates eligibility (no target, no TD)
    rec_td = _capped_split(team.pass_td, rz_t[:, None] * (targets > 0), targets, rng)
    # unbiased catch rate on the non-TD targets: E[rec] stays targets * catch_rate
    rest = targets - rec_td
    cr_adj = np.clip((catch_rate * targets - rec_td) / np.maximum(rest, 1), 0.0, 1.0)
    rec = rec_td + rng.binomial(rest, cr_adj)
    rec_yds = _gamma_yards(rec, ypr, rec_shape, rng)

    # rushing
    carries = _dirichlet_split(team.rush_att, car_share, conc, rng)
    rush_td = _capped_split(team.rush_td, rz_c[:, None] * (carries > 0), carries, rng)
    rush_yds = _gamma_yards(carries, ypc, car_shape, rng)

    # QB1 takes the whole passing line; its totals are the receivers' sums by construction
    qb_mask = u["is_qb1"].fill_null(False).to_numpy()
    pass_att = np.zeros((P, n), dtype=np.int64)
    cmp_ = np.zeros_like(pass_att)
    pass_yds = np.zeros_like(pass_att)
    pass_td = np.zeros_like(pass_att)
    ints = np.zeros_like(pass_att)
    if qb_mask.any():
        q = int(np.argmax(qb_mask))
        pass_att[q] = team.pass_att
        cmp_[q] = rec.sum(axis=0)
        pass_yds[q] = rec_yds.sum(axis=0)
        pass_td[q] = rec_td.sum(axis=0)
        ints[q] = team.int

    fum_lost = rng.binomial(carries + rec, fum_rate)

    return PlayerDraws(team=team.team, player_ids=ids, positions=pos, pass_att=pass_att, cmp=cmp_,
                       pass_yds=pass_yds, pass_td=pass_td, int=ints, carries=carries,
                       rush_yds=rush_yds, rush_td=rush_td, targets=targets, rec=rec,
                       rec_yds=rec_yds, rec_td=rec_td, fum_lost=fum_lost)


def dst_stats(opp: TeamDraws, opp_players: PlayerDraws | None) -> dict[str, np.ndarray]:
    """DST line for the team facing `opp`, taken from the opponent's draws."""
    n = opp.pts.shape[0]
    fum_rec = opp_players.fum_lost.sum(axis=0) if opp_players is not None else np.zeros(n, dtype=int)
    z = np.zeros(n, dtype=np.int64)
    return {"pts_allowed": opp.pts, "sacks": opp.sacks, "int": opp.int, "fum_rec": fum_rec,
            "td": z, "safety": z, "block_kick": z}
