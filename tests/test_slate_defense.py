"""Spec for defenders in simulate_one: own rng stream, proj rows, parquet, correlations, exclusions.

Interfaces under test:
    slate.simulate_one(...) with priors.defense -> defender proj rows (position DL/LB/DB)
    players.NON_OFFENSE_POSITIONS covers DST, K and the defender groups
"""
from __future__ import annotations

import numpy as np
import polars as pl
import pytest

from nfl_edge.config import load_yaml
from nfl_edge.sim import players as pp
from nfl_edge.sim import slate
from nfl_edge.sim.game import GameDraws, TeamDraws, TeamPrior

N = 3000
GAME = {"game_id": "2026_08_AWY_HOM", "home_team": "HOM", "away_team": "AWY", "home_rest": 7,
        "away_rest": 7, "roof": "outdoors", "wind": 0, "location": None,
        "market_spread": None, "market_total": None}


def _team(team: str, rng: np.random.Generator) -> TeamDraws:
    sacks = rng.integers(0, 6, N)
    return TeamDraws(team=team, drives=rng.integers(8, 14, N), plays_per_drive=rng.uniform(5, 7, N),
                     plays=rng.integers(50, 80, N), pass_att=rng.integers(20, 45, N),
                     rush_att=rng.integers(15, 35, N), sacks=sacks, td=rng.integers(0, 5, N),
                     pass_td=rng.integers(0, 4, N), rush_td=rng.integers(0, 3, N),
                     fg=rng.integers(0, 4, N), pts=rng.integers(3, 42, N), int=rng.integers(0, 3, N))


def _players(team: str, rng: np.random.Generator, opp: TeamDraws) -> pp.PlayerDraws:
    ids = [f"{team}_qb", f"{team}_rb", f"{team}_wr"]
    def z(hi):
        return rng.integers(0, hi, (3, N))
    # QB yards fall with the opponent's sacks so a defender's sacks correlate negatively with them
    pass_yds = np.zeros((3, N), dtype=np.int64)
    pass_yds[0] = np.clip(300 - 40 * opp.sacks + rng.integers(-30, 30, N), 0, None)
    return pp.PlayerDraws(team=team, player_ids=ids, positions=["QB", "RB", "WR"], pass_att=z(40),
                          cmp=z(25), pass_yds=pass_yds, pass_td=z(3), int=z(2), carries=z(20),
                          rush_yds=z(100), rush_td=z(2), targets=z(10), rec=z(8), rec_yds=z(100),
                          rec_td=z(2), fum_lost=z(2))


@pytest.fixture
def setup(monkeypatch, tmp_path):
    monkeypatch.setattr(slate, "ROOT", tmp_path)
    rng = np.random.default_rng(11)
    home, away = _team("HOM", rng), _team("AWY", rng)
    # each offense's QB faces the other team's pass rush: tie QB yards to its own team's sacks taken
    draws_by_team = {"HOM": _players("HOM", rng, home), "AWY": _players("AWY", rng, away)}
    monkeypatch.setattr(slate, "simulate_game", lambda *a, **k: GameDraws(
        home=home, away=away, ppd_adj={"home": 2.1, "away": 1.9}, drives_mean=11.0))
    monkeypatch.setattr(slate, "team_prior", lambda priors, team, cfg: TeamPrior(
        team=team, drives_mean=11.0, plays_per_drive=5.7, neutral_pass_rate=0.59, off_ppd=2.1,
        def_ppd_allowed=2.1, fg_per_drive=0.16, pass_td_share=0.62, int_rate=0.02, sack_rate=0.06))
    monkeypatch.setattr(slate, "qb_channel", lambda priors, team: (1.0, 0.9))
    monkeypatch.setattr(slate, "_team_checks", lambda *a, **k: [])
    monkeypatch.setattr(slate.pp, "allocate", lambda t, *a, **k: draws_by_team[t.team])
    return load_yaml("sim.yaml"), load_yaml("scoring.yaml")


def _priors(defense: pl.DataFrame):
    class P:
        usage = pl.DataFrame({"team": ["HOM", "AWY"], "player_id": ["HOM_qb", "AWY_qb"]})
        efficiency = pl.DataFrame({"player_id": ["HOM_qb", "AWY_qb"]})
        qb = pl.DataFrame()
        team = type("T", (), {"teams": pl.DataFrame(), "league": {}})()
    P.kicking = {}
    P.defense = defense
    return P()


def _shares(n_per_team: int = 8) -> pl.DataFrame:
    rows = []
    for team in ("HOM", "AWY"):
        w = np.arange(n_per_team, 0, -1, dtype=float)
        w /= w.sum()
        for i in range(n_per_team):
            rows.append({"team": team, "player_id": f"{team}_d{i}", "full_name": f"D{i}",
                         "position": ("DL", "LB", "DB")[i % 3], "n_eff": 5.0,
                         "sack_share": w[i], "int_share": w[i], "fr_share": w[i]})
    return pl.DataFrame(rows)


def _run(setup, tmp_path, defense):
    cfg, rules = setup
    return slate.simulate_one(GAME, _priors(defense), cfg, rules, N, 5, tmp_path)


def test_offense_and_dst_unchanged_by_defenders(setup, tmp_path):
    _, base, _, _ = _run(setup, tmp_path / "a", pl.DataFrame())
    _, withd, _, _ = _run(setup, tmp_path / "b", _shares())
    off = {r["player_id"]: r for r in withd if r["position"] not in pp.DEFENDER_POSITIONS}
    assert set(off) == {r["player_id"] for r in base}
    for r in base:
        assert off[r["player_id"]]["fpts_dk_mean"] == r["fpts_dk_mean"]
        assert off[r["player_id"]]["fpts_dk_sd"] == r["fpts_dk_sd"]


def test_defender_rows_parquet_and_summaries(setup, tmp_path):
    _, rows, checks, _ = _run(setup, tmp_path, _shares())
    d = [r for r in rows if r["position"] in pp.DEFENDER_POSITIONS]
    assert len(d) == 16
    assert {"sacks", "int", "fum_rec", "fpts_ppr"} <= set(d[0]["stat_summary"])
    frame = pl.read_parquet(tmp_path / f"{GAME['game_id']}.parquet")
    dpar = frame.filter(pl.col("player_id").is_in([r["player_id"] for r in d]))
    assert dpar.height == 16 * N
    assert (dpar["pass_yds"] == 0).all() and (dpar["int"] == 0).all()
    assert not any(c["check_name"] == "defenders_projected" for c in checks)


def test_defender_qb_correlation_stored(setup, tmp_path):
    cfg, _ = setup
    _, _, _, corr = _run(setup, tmp_path, _shares())
    top = cfg["players"]["defender_corr_top"]
    pair = corr.filter(((pl.col("player_id_a") == "HOM_d0") & (pl.col("player_id_b") == "AWY_qb"))
                       | ((pl.col("player_id_a") == "AWY_qb") & (pl.col("player_id_b") == "HOM_d0")))
    assert pair.height == 1
    assert pair["corr_dk"][0] < 0
    d_ids = {f"{t}_d{i}" for t in ("HOM", "AWY") for i in range(8)}
    both_def = corr.filter(pl.col("player_id_a").is_in(d_ids) & pl.col("player_id_b").is_in(d_ids))
    assert both_def.is_empty()
    in_corr = set(corr["player_id_a"]) | set(corr["player_id_b"])
    assert len(in_corr & d_ids) == 2 * top


def test_team_without_defender_shares_warns(setup, tmp_path):
    _, rows, checks, _ = _run(setup, tmp_path, _shares().filter(pl.col("team") == "HOM"))
    warn = [c for c in checks if c["check_name"] == "defenders_projected"]
    assert len(warn) == 1 and warn[0]["team"] == "AWY" and warn[0]["severity"] == "warning"
    assert sum(r["position"] in pp.DEFENDER_POSITIONS for r in rows) == 8


def test_non_offense_positions_cover_defenders():
    assert set(pp.NON_OFFENSE_POSITIONS) == {"DST", "K", "DL", "LB", "DB"}


def test_offense_readers_exclude_defenders():
    import inspect

    from nfl_edge import rebuild
    from nfl_edge.outputs import props
    from nfl_edge.research import context
    from nfl_edge.results import player_proj_actual

    for mod in (rebuild, context, player_proj_actual):
        src = inspect.getsource(mod)
        assert "not in ('DST', 'K')" not in src
        assert "'DL', 'LB', 'DB'" in src
    assert "NON_OFFENSE_POSITIONS" in inspect.getsource(props.fair_props)
    assert "NON_OFFENSE_POSITIONS" in inspect.getsource(slate.run)
