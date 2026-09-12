"""A game without usage priors must fail the run and leave no parquet dir."""
import numpy as np
import polars as pl
import pytest

from nfl_edge.sim import slate
from nfl_edge.sim.game import GameDraws, TeamDraws, TeamPrior


def _team_draws(team: str, n: int = 8) -> TeamDraws:
    z = np.zeros(n, dtype=np.int64)
    return TeamDraws(
        team=team, drives=z + 10, plays_per_drive=np.full(n, 5.5), plays=z + 55,
        pass_att=z + 30, rush_att=z + 25, sacks=z, td=z + 2, pass_td=z + 1,
        rush_td=z + 1, fg=z + 1, pts=z + 17, int=z,
    )


def test_empty_usage_raises_before_writing_player_draws(tmp_path, monkeypatch):
    n = 8
    home = _team_draws("HOM", n)
    away = _team_draws("AWY", n)
    g = {
        "game_id": "2026_01_WAS_PHI", "home_team": "WAS", "away_team": "PHI",
        "home_rest": 7, "away_rest": 7, "roof": "outdoors", "wind": 0, "location": None,
        "market_spread": None, "market_total": None,
    }

    class FakePriors:
        usage = pl.DataFrame(schema={"team": pl.Utf8, "player_id": pl.Utf8})
        efficiency = pl.DataFrame(schema={"player_id": pl.Utf8})
        qb = pl.DataFrame()
        team = type("T", (), {
            "teams": pl.DataFrame(),
            "league": {"drives_mean": 11.0, "off_ppd": 2.1, "def_ppd_allowed": 2.1},
        })()

    monkeypatch.setattr(slate, "simulate_game", lambda *a, **k: GameDraws(
        home=home, away=away, ppd_adj={"home": 2.1, "away": 1.9}, drives_mean=11.0,
    ))
    monkeypatch.setattr(slate, "team_prior", lambda priors, team, cfg: TeamPrior(
        team=team, drives_mean=11.0, plays_per_drive=5.7, neutral_pass_rate=0.59,
        off_ppd=2.1, def_ppd_allowed=2.1, fg_per_drive=0.16, pass_td_share=0.62,
        int_rate=0.02, sack_rate=0.06,
    ))
    cfg = {"team": {}, "priors": {}, "checks": {"max_spread_gap_vs_market": 6, "max_total_gap_vs_market": 8}}
    with pytest.raises(ValueError, match="2026_01_WAS_PHI: no usage priors for"):
        slate.simulate_one(g, FakePriors(), cfg, {}, n, 1, tmp_path)
    assert list(tmp_path.glob("*.parquet")) == []


def test_run_wipes_out_dir_when_a_later_game_fails(tmp_path, monkeypatch):
    import uuid

    def fake_one(g, priors, cfg, rules, n, seed, out_dir):
        if g["game_id"].endswith("WAS_PHI"):
            raise ValueError("2026_01_WAS_PHI: no usage priors for WAS")
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / f"{g['game_id']}.parquet").write_bytes(b"x")
        (out_dir / f"{g['game_id']}.game.parquet").write_bytes(b"x")
        return {}, [], [], pl.DataFrame()

    monkeypatch.setattr(slate, "load_games", lambda s, w: pl.DataFrame([
        {"game_id": "2026_01_DAL_PHI", "home_team": "PHI", "away_team": "DAL"},
        {"game_id": "2026_01_WAS_PHI", "home_team": "PHI", "away_team": "WAS"},
    ]))
    monkeypatch.setattr(slate, "simulate_one", fake_one)
    monkeypatch.setattr(slate, "DRAWS_ROOT", tmp_path)
    monkeypatch.setattr(uuid, "uuid4", lambda: uuid.UUID("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"))
    with pytest.raises(ValueError, match="no usage priors"):
        slate.run(2026, 1, draws=8, persist=False, priors=object())
    leftover = list(tmp_path.rglob("*"))
    assert not any(p.suffix == ".parquet" for p in leftover)
