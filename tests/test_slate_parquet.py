"""Write-contract: player/game draws persist as Int16/Float32/zstd and read back identically."""
from __future__ import annotations

import inspect

import numpy as np
import polars as pl

from nfl_edge.outputs.props import _quantiles
from nfl_edge.sim import players as pp
from nfl_edge.sim import slate
from nfl_edge.sim.game import GameDraws, TeamDraws


def _team(team: str, n: int, rng: np.random.Generator) -> TeamDraws:
    return TeamDraws(
        team=team,
        drives=rng.integers(8, 14, size=n),
        plays_per_drive=rng.uniform(5, 7, size=n),
        plays=rng.integers(50, 80, size=n),
        pass_att=rng.integers(20, 45, size=n),
        rush_att=rng.integers(15, 35, size=n),
        sacks=rng.integers(0, 5, size=n),
        td=rng.integers(0, 5, size=n),
        pass_td=rng.integers(0, 4, size=n),
        rush_td=rng.integers(0, 3, size=n),
        fg=rng.integers(0, 4, size=n),
        pts=rng.integers(3, 42, size=n),
        int=rng.integers(0, 3, size=n),
    )


def _players(n: int, rng: np.random.Generator) -> pp.PlayerDraws:
    P = 4
    ids = ["p1", "p2", "p3", "p4"]
    pos = ["QB", "RB", "WR", "WR"]
    return pp.PlayerDraws(
        team="HOM",
        player_ids=ids,
        positions=pos,
        pass_att=rng.integers(0, 40, size=(P, n)),
        cmp=rng.integers(0, 25, size=(P, n)),
        pass_yds=rng.integers(0, 350, size=(P, n)),
        pass_td=rng.integers(0, 4, size=(P, n)),
        int=rng.integers(0, 3, size=(P, n)),
        carries=rng.integers(0, 20, size=(P, n)),
        rush_yds=rng.integers(-5, 120, size=(P, n)),
        rush_td=rng.integers(0, 3, size=(P, n)),
        targets=rng.integers(0, 15, size=(P, n)),
        rec=rng.integers(0, 12, size=(P, n)),
        rec_yds=rng.integers(-5, 150, size=(P, n)),
        rec_td=rng.integers(0, 3, size=(P, n)),
        fum_lost=rng.integers(0, 2, size=(P, n)),
    )


def test_parquet_roundtrip_preserves_schema_and_summaries(tmp_path):
    n = 200
    rng = np.random.default_rng(7)
    home, away = _team("HOM", n, rng), _team("AWY", n, rng)
    draws = GameDraws(home=home, away=away, drives_mean=11.0, ppd_adj={"home": 2.1, "away": 1.9})
    players = _players(n, rng)
    fpts = {site: rng.normal(12, 4, size=players.targets.shape).astype(np.float32)
            for site in ("dk", "fd", "ppr")}

    gpath = tmp_path / "game.game.parquet"
    ppath = tmp_path / "game.parquet"
    gframe = slate._game_frame(draws)
    pframe = slate._player_frame(players, fpts)
    assert 'compression="zstd"' in inspect.getsource(slate.simulate_one)
    gframe.write_parquet(gpath, compression="zstd")
    pframe.write_parquet(ppath, compression="zstd")

    gback = pl.read_parquet(gpath)
    pback = pl.read_parquet(ppath)
    assert gback.schema["draw_no"] == pl.Int32
    assert gback.schema["home_pts"] == pl.Int16
    assert gback.schema["away_pts"] == pl.Int16
    assert pback.schema["draw_no"] == pl.Int32
    for col in slate.PLAYER_STATS:
        assert pback.schema[col] == pl.Int16
    for col in ("fpts_dk", "fpts_fd", "fpts_ppr"):
        assert pback.schema[col] == pl.Float32

    margin = home.pts.astype(np.int16) - away.pts.astype(np.int16)
    total = home.pts.astype(np.int16) + away.pts.astype(np.int16)
    g_margin = (gback["home_pts"] - gback["away_pts"]).to_numpy()
    g_total = (gback["home_pts"] + gback["away_pts"]).to_numpy()
    assert float(g_margin.mean()) == float(margin.mean())
    assert float(g_total.mean()) == float(total.mean())

    rec = pback.filter(pl.col("player_id") == "p3")["rec_yds"].to_numpy()
    rec_mem = players.rec_yds[2].astype(np.int16)
    assert _quantiles(rec) == _quantiles(rec_mem)
    assert float(rec.mean()) == float(rec_mem.astype(float).mean())

    dk_mem = fpts["dk"].astype(np.float32)
    wide = pback.select(["player_id", "draw_no", "fpts_dk"]).pivot(
        on="player_id", index="draw_no", values="fpts_dk"
    )
    order = ["p1", "p2", "p3", "p4"]
    dk_back = np.vstack([wide[pid].to_numpy() for pid in order])
    np.testing.assert_array_equal(dk_back, dk_mem)
    np.testing.assert_array_equal(np.corrcoef(dk_back), np.corrcoef(dk_mem))
