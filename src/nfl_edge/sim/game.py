"""Game simulator: one correlated draw of both teams' drives, plays, scoring, and play mix.

Per draw and team:
  drives ~ round(Normal(mean of both teams' drives_mean, sd)), clipped 6..16   (single pace draw)
  plays_per_drive = own prior + game-script adjustment (trailing team runs more plays) + noise
  plays = round(drives * plays_per_drive)                                      (never drawn independently)
  fg ~ Bin(drives, fg_per_drive)                          team FG rate held fixed
  p_td = (ppd_adj - 3*fg_per_drive) / (7*(1 - fg_per_drive)) clipped [0.05, 0.6]; td ~ Bin(drives - fg, p_td)
  pts = 6*td + 3*fg + XP/2-pt outcomes per TD
  pass_att = plays * (neutral_pass_rate + k*sign(margin)*sqrt|margin| + noise) - sacks; rush_att = rest
  td split into pass_td / rush_td by pass_td_share; int ~ Bin(pass_att, int_rate)

ppd_adj = league_ppd + (off_ppd - league) + (def_ppd_allowed - league) + HFA/rest/wind in points per
drive. Check (5) in sim/slate.py compares mean points against E[drives] * ppd_adj.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

XP_MAKE = 0.94         # extra point success
TWO_PT_RATE = 0.06     # share of TDs followed by a 2-pt try
TWO_PT_MAKE = 0.48
DRIVES_SD = 1.0
SCRIPT_PASS_K = 0.03   # pass-rate shift per sqrt(point) of deficit
SCRIPT_PPD_K = 0.01    # plays-per-drive shift per point trailing (trailing team runs more plays)
PPD_SD = 0.35          # per-draw noise in plays per drive
MIN_DRIVES, MAX_DRIVES = 6, 16
OT_TIE = 0.10          # regulation ties that stay tied after OT
OT_FG = 0.55           # OT decided by a field goal (else a touchdown, no XP)


@dataclass
class TeamPrior:
    team: str
    drives_mean: float
    plays_per_drive: float
    neutral_pass_rate: float
    off_ppd: float
    def_ppd_allowed: float
    fg_per_drive: float
    pass_td_share: float
    int_rate: float
    sack_rate: float

    @classmethod
    def from_row(cls, row: dict) -> TeamPrior:
        return cls(**{k: row[k] for k in cls.__dataclass_fields__})


@dataclass
class GameContext:
    home_field_pts: float = 1.5
    rest_diff_days: int = 0          # home_rest - away_rest
    wind_mph: float = 0.0
    roof: str = "outdoors"
    neutral_site: bool = False


@dataclass
class TeamDraws:
    team: str
    drives: np.ndarray
    plays_per_drive: np.ndarray
    plays: np.ndarray
    pass_att: np.ndarray
    rush_att: np.ndarray
    sacks: np.ndarray
    td: np.ndarray
    pass_td: np.ndarray
    rush_td: np.ndarray
    fg: np.ndarray
    pts: np.ndarray
    int: np.ndarray


@dataclass
class GameDraws:
    home: TeamDraws
    away: TeamDraws
    ppd_adj: dict[str, float]
    drives_mean: float
    p_td: dict[str, float] = field(default_factory=dict)


def ppd_adjustments(home: TeamPrior, away: TeamPrior, ctx: GameContext, cfg: dict, league: dict,
                    drives_mean: float) -> dict[str, float]:
    """Matchup-adjusted points per drive for each side (points-level effects / drives)."""
    lg = league["off_ppd"]
    base_home = lg + (home.off_ppd - lg) + (away.def_ppd_allowed - lg)
    base_away = lg + (away.off_ppd - lg) + (home.def_ppd_allowed - lg)
    tc = cfg["team"]
    hfa_pts = tc.get("neutral_site_hfa_pts", 0.0) if ctx.neutral_site else ctx.home_field_pts
    hfa = float(hfa_pts) / 2.0                                       # split: +half home, -half away
    rest = float(tc.get("rest_advantage_per_day", 0.0)) * ctx.rest_diff_days / 2.0
    wind_pen = 0.0
    if ctx.roof in ("outdoors", "open") and ctx.wind_mph > float(tc.get("weather_wind_threshold_mph", 99)):
        wind_pen = 1.5                                               # points per team per game
    home_pts = hfa + rest - wind_pen
    away_pts = -hfa - rest - wind_pen
    return {
        "home": max(0.3, base_home + home_pts / drives_mean),
        "away": max(0.3, base_away + away_pts / drives_mean),
    }


def solve_p_td(ppd_adj: float, fg_per_drive: float) -> float:
    """One unknown, one equation: E[pts/drive] = 7 p_td (1 - fg) + 3 fg."""
    return float(np.clip((ppd_adj - 3 * fg_per_drive) / (7 * (1 - fg_per_drive)), 0.05, 0.6))


def _points(td: np.ndarray, fg: np.ndarray, rng: np.random.Generator) -> np.ndarray:
    """6 per TD + 3 per FG + per-TD conversion: XP (1) or 2-pt (2) or miss (0)."""
    two_pt_tries = rng.binomial(td, TWO_PT_RATE)
    xp_tries = td - two_pt_tries
    xp_made = rng.binomial(xp_tries, XP_MAKE)
    two_made = rng.binomial(two_pt_tries, TWO_PT_MAKE)
    return 6 * td + 3 * fg + xp_made + 2 * two_made


def _team_scoring(prior: TeamPrior, drives: np.ndarray, p_td: float, rng: np.random.Generator):
    fg = rng.binomial(drives, prior.fg_per_drive)
    td = rng.binomial(drives - fg, p_td)
    pts = _points(td, fg, rng)
    return td, fg, pts


def _team_plays(prior: TeamPrior, drives: np.ndarray, margin: np.ndarray, td: np.ndarray, cfg: dict,
                rng: np.random.Generator):
    """Plays from drives, then the pass/rush mix conditioned on game script (own margin)."""
    n = drives.shape[0]
    ppd = prior.plays_per_drive - SCRIPT_PPD_K * margin + rng.normal(0.0, PPD_SD, n)
    ppd = np.clip(ppd, 3.0, 9.5)
    plays = np.round(drives * ppd).astype(np.int64)
    pass_sd = float(cfg["team"].get("pass_rate_sd", 0.05))
    rate = (prior.neutral_pass_rate - SCRIPT_PASS_K * np.sign(margin) * np.sqrt(np.abs(margin))
            + rng.normal(0.0, pass_sd, n))
    rate = np.clip(rate, 0.25, 0.85)
    dropbacks = rng.binomial(plays, rate)
    sacks = rng.binomial(dropbacks, prior.sack_rate)
    pass_att = dropbacks - sacks
    rush_att = plays - dropbacks
    pass_td = rng.binomial(td, prior.pass_td_share)
    rush_td = td - pass_td
    ints = rng.binomial(pass_att, prior.int_rate)
    return ppd, plays, pass_att, rush_att, sacks, pass_td, rush_td, ints


def simulate_game(home: TeamPrior, away: TeamPrior, ctx: GameContext, n: int,
                  rng: np.random.Generator, cfg: dict, league: dict) -> GameDraws:
    drives_mean = 0.5 * (home.drives_mean + away.drives_mean)
    ppd_adj = ppd_adjustments(home, away, ctx, cfg, league, drives_mean)
    p_td = {"home": solve_p_td(ppd_adj["home"], home.fg_per_drive),
            "away": solve_p_td(ppd_adj["away"], away.fg_per_drive)}

    # single pace draw shared by both teams (possession alternates), independent small jitter
    pace = rng.normal(drives_mean, DRIVES_SD, n)
    drives_h = np.clip(np.round(pace + rng.normal(0, 0.5, n)), MIN_DRIVES, MAX_DRIVES).astype(np.int64)
    drives_a = np.clip(np.round(pace + rng.normal(0, 0.5, n)), MIN_DRIVES, MAX_DRIVES).astype(np.int64)

    td_h, fg_h, pts_h = _team_scoring(home, drives_h, p_td["home"], rng)
    td_a, fg_a, pts_a = _team_scoring(away, drives_a, p_td["away"], rng)

    # Overtime: regulation ties get one extra drive for the winner; ~10% stay tied.
    tie = pts_h == pts_a
    if tie.any():
        k = int(tie.sum())
        decided = rng.random(k) >= OT_TIE
        p_home = p_td["home"] / (p_td["home"] + p_td["away"])
        home_wins = rng.random(k) < p_home
        by_fg = rng.random(k) < OT_FG
        idx = np.where(tie)[0]
        for side_mask, drives, td, fg, pts in ((home_wins, drives_h, td_h, fg_h, pts_h),
                                               (~home_wins, drives_a, td_a, fg_a, pts_a)):
            sel = idx[decided & side_mask]
            fgs = by_fg[decided & side_mask]
            drives[sel] = np.minimum(drives[sel] + 1, MAX_DRIVES)
            fg[sel] += fgs
            td[sel] += ~fgs
            pts[sel] += np.where(fgs, 3, 6)
    margin = (pts_h - pts_a).astype(float)

    def build(prior, drives, td, fg, pts, own_margin):
        ppd, plays, pa, ra, sk, ptd, rtd, ints = _team_plays(prior, drives, own_margin, td, cfg, rng)
        return TeamDraws(team=prior.team, drives=drives, plays_per_drive=ppd, plays=plays,
                         pass_att=pa, rush_att=ra, sacks=sk, td=td, pass_td=ptd, rush_td=rtd,
                         fg=fg, pts=pts, int=ints)

    return GameDraws(
        home=build(home, drives_h, td_h, fg_h, pts_h, margin),
        away=build(away, drives_a, td_a, fg_a, pts_a, -margin),
        ppd_adj=ppd_adj, drives_mean=drives_mean, p_td=p_td,
    )
