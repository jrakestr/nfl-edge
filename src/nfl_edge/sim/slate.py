"""Run the simulator for every game of a week: priors -> game -> players -> scoring -> parquet + summaries.

Persisted:
  data/draws/{season}/{week}/{run_id}/{game_id}.parquet   long player draws (Int16 / Float32, zstd)
  data/draws/{season}/{week}/{run_id}/{game_id}.game.parquet  team-level draws
  model.sim_runs, model.proj_games, model.proj_players, model.player_correlations, model.sim_checks

Checks (severity):
  invariant: td_sum, qb_totals, opportunity_totals, usage_shares, mean_points (vs E[drives]*ppd_adj),
             mean_plays (vs E[drives]*plays_per_drive)
  warning:   total_gap_vs_market, spread_gap_vs_market
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import uuid
import zlib
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import polars as pl

from .. import priors as pr
from ..config import ROOT, load_yaml
from ..db import insert, read_sql
from ..market import edge as market_edge
from . import players as pp
from . import scoring
from .game import GameContext, GameDraws, TeamDraws, TeamPrior, simulate_game

DRAWS_ROOT = ROOT / "data" / "draws"
TEAM_FIELDS = ("drives", "plays", "pass_att", "rush_att", "sacks", "td", "pass_td", "rush_td", "fg",
               "pts", "int")
PLAYER_STATS = ("pass_att", "cmp", "pass_yds", "pass_td", "int", "carries", "rush_yds", "rush_td",
                "targets", "rec", "rec_yds", "rec_td", "fum_lost")


@dataclass
class RunResult:
    run_id: str
    season: int
    week: int
    draws: int
    proj_games: pl.DataFrame
    proj_players: pl.DataFrame
    checks: pl.DataFrame
    correlations: pl.DataFrame = field(default_factory=pl.DataFrame)

    def summary(self) -> str:
        inv = self.checks.filter(pl.col("severity") == "invariant")
        warn = self.checks.filter(pl.col("severity") == "warning")
        return (f"run {self.run_id} {self.season} wk{self.week}: {self.proj_games.height} games, "
                f"{self.draws} draws; invariants {int(inv['passed'].sum())}/{inv.height} passed; "
                f"warnings {int((~warn['passed']).sum())}/{warn.height} flagged")


# ----------------------------------------------------------------------------- inputs

def load_games(season: int, week: int) -> pl.DataFrame:
    """Regular-season games for the week with the latest market snapshot (fallback: schedules).

    Deliberately does not select result/total: the simulator never sees outcomes.
    """
    return read_sql(
        """
        select s.game_id, s.season, s.week, s.home_team, s.away_team, s.home_rest, s.away_rest,
               s.roof, s.wind,
               coalesce(m.spread_line, s.spread_line)::float8 as market_spread,
               coalesce(m.total_line, s.total_line)::float8 as market_total
        from raw.schedules s
        left join lateral (
            select spread_line, total_line from raw.market_lines
            where game_id = s.game_id order by captured_at desc limit 1
        ) m on true
        where s.season = %s and s.week = %s and s.game_type = 'REG'
        order by s.game_id
        """,
        (season, week),
    )


def qb_channel(priors: pr.Priors, team: str) -> tuple[float, float]:
    """(qb_pass_factor, qb_att_share) for the team's expected starter; neutral when unknown."""
    if priors.qb.is_empty():
        return 1.0, 1.0
    row = priors.qb.filter(pl.col("team") == team)
    if row.is_empty():
        return 1.0, 1.0
    r = row.row(0, named=True)
    return float(r["qb_pass_factor"]), float(r["qb_att_share"])


def team_prior(priors: pr.Priors, team: str, cfg: dict) -> TeamPrior:
    row = priors.team.teams.filter(pl.col("team") == team)
    if row.is_empty():
        d = {k: priors.team.league[k] for k in priors.team.league}
    else:
        d = row.row(0, named=True)
    d["team"] = team
    factor, _ = qb_channel(priors, team)
    d["off_ppd"] = d["off_ppd"] * factor ** float(cfg["priors"].get("qb_ppd_elasticity", 0.6))
    return TeamPrior.from_row(d)


def qb_adjusted_efficiency(eff: pl.DataFrame, factor: float) -> pl.DataFrame:
    """Receiver rates were measured under the team's lookback QB play; rescale to the starter."""
    if factor == 1.0 or eff.is_empty():
        return eff
    return eff.with_columns(
        (pl.col("yds_per_rec") * factor).alias("yds_per_rec"),
        (pl.col("yds_per_target") * factor).alias("yds_per_target"),
        (pl.col("catch_rate") * factor ** 0.5).clip(0.2, 0.95).alias("catch_rate"),
    )


def game_context(g: dict, cfg: dict) -> GameContext:
    return GameContext(
        home_field_pts=float(cfg["team"].get("home_field_pts", 1.5)),
        rest_diff_days=int((g.get("home_rest") or 7) - (g.get("away_rest") or 7)),
        wind_mph=float(g.get("wind") or 0.0),
        roof=g.get("roof") or "outdoors",
    )


def game_rng(seed: int, game_id: str) -> np.random.Generator:
    return np.random.default_rng([seed, zlib.crc32(game_id.encode())])


# ----------------------------------------------------------------------------- one game

def _game_frame(d: GameDraws) -> pl.DataFrame:
    cols = {"draw_no": np.arange(d.home.pts.shape[0], dtype=np.int32)}
    for side, t in (("home", d.home), ("away", d.away)):
        for f in TEAM_FIELDS:
            cols[f"{side}_{f}"] = getattr(t, f).astype(np.int16)
    return pl.DataFrame(cols)


def _player_frame(p: pp.PlayerDraws, fpts: dict[str, np.ndarray]) -> pl.DataFrame:
    P, n = p.targets.shape
    cols = {
        "draw_no": np.tile(np.arange(n, dtype=np.int32), P),
        "player_id": np.repeat(np.array(p.player_ids, dtype=object), n),
    }
    for s in PLAYER_STATS:
        cols[s] = getattr(p, s).astype(np.int16).ravel()
    for site in ("dk", "fd", "ppr"):
        cols[f"fpts_{site}"] = fpts[site].astype(np.float32).ravel()
    return pl.DataFrame(cols)


def _dst_frame(team: str, n: int, dst_pts: np.ndarray) -> pl.DataFrame:
    cols = {"draw_no": np.arange(n, dtype=np.int32),
            "player_id": np.repeat(np.array([f"{team}_DST"], dtype=object), n)}
    for s in PLAYER_STATS:
        cols[s] = np.zeros(n, dtype=np.int16)
    for site in ("dk", "fd", "ppr"):
        cols[f"fpts_{site}"] = dst_pts.astype(np.float32)
    return pl.DataFrame(cols)


def _histogram(arr: np.ndarray, n_bins: int = 20) -> dict:
    counts, edges = np.histogram(arr, bins=n_bins)
    return {"bins": [round(float(x), 4) for x in edges], "counts": [int(c) for c in counts]}


def _summarize(name: str, arr: np.ndarray) -> dict:
    del name
    q = np.percentile(arr, [10, 50, 90])
    return {"mean": round(float(arr.mean()), 3), "sd": round(float(arr.std()), 3),
            "p10": float(q[0]), "p50": float(q[1]), "p90": float(q[2]),
            "hist": _histogram(arr)}


def _team_checks(t: TeamDraws, p: pp.PlayerDraws | None, usage: pl.DataFrame, d: GameDraws,
                 side: str, prior: TeamPrior, game_id: str, cfg: dict) -> list[dict]:
    base = {"game_id": game_id, "team": t.team}
    out = []

    def add(name, value, threshold, passed, severity="invariant", detail=None):
        out.append({**base, "check_name": name, "value": float(value), "threshold": float(threshold),
                    "passed": bool(passed), "severity": severity, "detail": detail})

    # (4) usage shares
    if usage.is_empty():
        add("usage_shares", 1.0, 1e-3, False, detail="no players with history on roster")
    else:
        dev = max(abs(float(usage[c].sum()) - 1.0) for c in pp.SHARE_COLS)
        add("usage_shares", dev, 1e-3, dev <= 1e-3)
        add("one_qb1", float(usage["is_qb1"].sum()), 1, int(usage["is_qb1"].sum()) == 1)
    if p is not None:
        # (1) player TDs == team TDs in every draw
        ok = ((p.rec_td.sum(0) == t.pass_td) & (p.rush_td.sum(0) == t.rush_td)).mean()
        add("td_sum", ok, 1.0, ok == 1.0)
        # (2) passer totals (QB1 + QB2) == receiver sums and team pass_att
        if p.pass_att.any():
            ok = ((p.pass_att.sum(0) == t.pass_att) & (p.pass_yds.sum(0) == p.rec_yds.sum(0))
                  & (p.cmp.sum(0) == p.rec.sum(0)) & (p.pass_td.sum(0) == p.rec_td.sum(0))
                  & (p.int.sum(0) == t.int)).mean()
            add("qb_totals", ok, 1.0, ok == 1.0)
        ok = ((p.targets.sum(0) == t.pass_att) & (p.carries.sum(0) == t.rush_att)).mean()
        add("opportunity_totals", ok, 1.0, ok == 1.0)
    # (5) mean points vs E[drives] * ppd_adj; (6) mean plays vs E[drives] * plays_per_drive
    exp_pts = d.drives_mean * d.ppd_adj[side]
    add("mean_points", abs(t.pts.mean() - exp_pts), 1.5, abs(t.pts.mean() - exp_pts) <= 1.5,
        detail=f"mean={t.pts.mean():.2f} expected={exp_pts:.2f}")
    exp_plays = d.drives_mean * prior.plays_per_drive
    add("mean_plays", abs(t.plays.mean() - exp_plays), 2.0, abs(t.plays.mean() - exp_plays) <= 2.0,
        detail=f"mean={t.plays.mean():.1f} expected={exp_plays:.1f}")
    return out


def simulate_one(g: dict, priors: pr.Priors, cfg: dict, rules: dict, n: int, seed: int,
                 out_dir: Path) -> tuple[dict, list[dict], list[dict], pl.DataFrame]:
    """Returns (proj_game row, proj_player rows, check rows, correlation frame)."""
    game_id = g["game_id"]
    home, away = g["home_team"], g["away_team"]
    rng = game_rng(seed, game_id)
    hp, ap = team_prior(priors, home, cfg), team_prior(priors, away, cfg)
    d = simulate_game(hp, ap, game_context(g, cfg), n, rng, cfg, priors.team.league)

    frames, proj_players, checks = [], [], []
    fpts_dk: dict[str, np.ndarray] = {}
    pdraws: dict[str, pp.PlayerDraws | None] = {}
    sides = (("home", d.home, hp), ("away", d.away, ap))
    for side, t, prior in sides:
        factor, att_share = qb_channel(priors, t.team)
        usage = priors.usage.filter(pl.col("team") == t.team).with_columns(pl.lit(att_share).alias("qb_att_share"))
        eff = qb_adjusted_efficiency(priors.efficiency.filter(pl.col("player_id").is_in(usage["player_id"])), factor)
        p = pp.allocate(t, usage, eff, cfg, rng) if not usage.is_empty() else None
        pdraws[t.team] = p
        checks += _team_checks(t, p, usage, d, side, prior, game_id, cfg)
        if p is None:
            continue
        fp = {"dk": np.empty_like(p.rec_yds, dtype=float), "fd": np.empty_like(p.rec_yds, dtype=float),
              "ppr": np.empty_like(p.rec_yds, dtype=float)}
        for i, pid in enumerate(p.player_ids):
            s = scoring.score_offense(p.stats(i), rules)
            for site, arr in fp.items():
                arr[i] = s[site]
            fpts_dk[pid] = s["dk"]
            proj_players.append({
                "player_id": pid, "game_id": game_id, "team": t.team, "position": p.positions[i],
                "stat_summary": {**{k: _summarize(k, p.stats(i)[k]) for k in
                                    ("pass_yds", "pass_td", "int", "rush_yds", "rush_td", "rec",
                                     "rec_yds", "rec_td")},
                                 "targets": _summarize("targets", p.targets[i]),
                                 "carries": _summarize("carries", p.carries[i]),
                                 "fpts_ppr": _summarize("fpts_ppr", s["ppr"])},
                "fpts_dk_mean": float(s["dk"].mean()), "fpts_dk_sd": float(s["dk"].std()),
                "fpts_fd_mean": float(s["fd"].mean()), "fpts_fd_sd": float(s["fd"].std()),
            })
        frames.append(_player_frame(p, fp))
    # DST for each side from the opponent's draws
    for (side, t, _), (_, opp, _) in ((sides[0], sides[1]), (sides[1], sides[0])):
        dst = scoring.score_dst(pp.dst_stats(opp, pdraws.get(opp.team)), rules)
        pid = f"{t.team}_DST"
        fpts_dk[pid] = dst
        proj_players.append({
            "player_id": pid, "game_id": game_id, "team": t.team, "position": "DST",
            "stat_summary": {"pts_allowed": _summarize("pts_allowed", opp.pts),
                             "sacks": _summarize("sacks", opp.sacks), "int": _summarize("int", opp.int),
                             "fpts_ppr": _summarize("fpts_ppr", dst)},
            "fpts_dk_mean": float(dst.mean()), "fpts_dk_sd": float(dst.std()),
            "fpts_fd_mean": float(dst.mean()), "fpts_fd_sd": float(dst.std()),
        })
        frames.append(_dst_frame(t.team, n, dst))

    # parquet
    out_dir.mkdir(parents=True, exist_ok=True)
    ppath = out_dir / f"{game_id}.parquet"
    gpath = out_dir / f"{game_id}.game.parquet"
    pl.concat(frames).write_parquet(ppath, compression="zstd")
    _game_frame(d).write_parquet(gpath, compression="zstd")
    rel = str(ppath.relative_to(ROOT))
    for row in proj_players:
        row["draws_path"] = rel

    # game summary + market-gap warnings
    margin = d.home.pts - d.away.pts
    total = d.home.pts + d.away.pts
    ms, mt = g.get("market_spread"), g.get("market_total")
    fair_spread, fair_total = float(np.median(margin)), float(np.median(total))
    proj_game = {
        "game_id": game_id, "fair_spread": fair_spread, "fair_total": fair_total,
        "mean_spread": float(margin.mean()), "mean_total": float(total.mean()),
        "home_win_prob": float((margin > 0).mean() + 0.5 * (margin == 0).mean()),
        "p_home_cover_market": None if ms is None else float((margin > ms).mean() + 0.5 * (margin == ms).mean()),
        "p_over_market": None if mt is None else float((total > mt).mean() + 0.5 * (total == mt).mean()),
        "market_spread": ms, "market_total": mt, "draws_path": str(gpath.relative_to(ROOT)),
        "line_grid": json.dumps(market_edge.build_line_grid(margin, total)),
    }
    for name, fair, mkt, thr in (("spread_gap_vs_market", fair_spread, ms, cfg["checks"]["max_spread_gap_vs_market"]),
                                 ("total_gap_vs_market", fair_total, mt, cfg["checks"]["max_total_gap_vs_market"])):
        if mkt is not None:
            gap = abs(fair - float(mkt))
            checks.append({"game_id": game_id, "team": None, "check_name": name, "value": gap,
                           "threshold": float(thr), "passed": gap <= thr, "severity": "warning",
                           "detail": f"fair={fair:.1f} market={float(mkt):.1f}"})

    # within-game correlations on DK points
    ids = list(fpts_dk)
    m = np.vstack([fpts_dk[i] for i in ids])
    sd = m.std(axis=1)
    keep = sd > 0
    corr_rows = []
    if keep.sum() >= 2:
        c = np.corrcoef(m[keep])
        kid = [i for i, k in zip(ids, keep) if k]
        iu = np.triu_indices(len(kid), k=1)
        corr_rows = [{"player_id_a": kid[a], "player_id_b": kid[b], "corr_dk": float(c[a, b])}
                     for a, b in zip(*iu)]
    corr = pl.DataFrame(corr_rows, schema={"player_id_a": pl.Utf8, "player_id_b": pl.Utf8, "corr_dk": pl.Float64})
    return proj_game, proj_players, checks, corr


# ----------------------------------------------------------------------------- run

def _git_sha() -> str | None:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT,
                                       text=True, stderr=subprocess.DEVNULL).strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def _config_hash() -> str:
    h = hashlib.sha256()
    for name in ("sim.yaml", "scoring.yaml"):
        h.update((ROOT / "config" / name).read_bytes())
    return h.hexdigest()[:16]


def run(season: int, week: int, draws: int | None = None, seed: int | None = None,
        note: str | None = None, persist: bool = True, priors: pr.Priors | None = None) -> RunResult:
    cfg = load_yaml("sim.yaml")
    rules = load_yaml("scoring.yaml")
    n = int(draws or cfg["draws_per_game"])
    seed = int(cfg["seed"] if seed is None else seed)
    run_id = str(uuid.uuid4())
    games = load_games(season, week)
    if games.is_empty():
        raise ValueError(f"no REG games in raw.schedules for {season} week {week}")
    priors = priors or pr.build(season, week)
    out_dir = DRAWS_ROOT / str(season) / str(week) / run_id

    pg, ppl, chk, corrs = [], [], [], []
    for g in games.iter_rows(named=True):
        a, b, c, d = simulate_one(g, priors, cfg, rules, n, seed, out_dir)
        pg.append(a)
        ppl += b
        chk += c
        corrs.append(d)
    proj_games = pl.DataFrame(pg).with_columns(pl.lit(run_id).alias("run_id"))
    proj_players = pl.DataFrame(ppl).with_columns(
        pl.lit(run_id).alias("run_id"), pl.col("stat_summary").map_elements(json.dumps, return_dtype=pl.Utf8)
    )
    checks = pl.DataFrame(chk, schema={"game_id": pl.Utf8, "team": pl.Utf8, "check_name": pl.Utf8,
                                       "value": pl.Float64, "threshold": pl.Float64, "passed": pl.Boolean,
                                       "severity": pl.Utf8, "detail": pl.Utf8}) \
        .with_columns(pl.lit(run_id).alias("run_id"))
    corr = pl.concat(corrs).with_columns(pl.lit(run_id).alias("run_id"))

    if persist:
        insert(pl.DataFrame({"run_id": [run_id], "season": [season], "week": [week],
                             "config_hash": [_config_hash()], "git_sha": [_git_sha()],
                             "draws_per_game": [n], "note": [note]}), "model.sim_runs")
        insert(proj_games, "model.proj_games")
        insert(proj_players, "model.proj_players")
        insert(corr, "model.player_correlations")
        insert(checks, "model.sim_checks")
    return RunResult(run_id, season, week, n, proj_games, proj_players, checks, corr)
