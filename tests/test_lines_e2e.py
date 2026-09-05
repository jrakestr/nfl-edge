"""End to end on a real 2025 week-10 run: parquet draws -> model.edges -> verdicts -> model.verdicts.

Marked `db`; excluded from the default run. Skips unless DATABASE_URL connects and the newest
2025 wk10 run's draws exist under data/draws. Writes only to model.edges / model.verdicts for
that run (idempotent insert-ignore), so it is safe to re-run.
"""
from __future__ import annotations

import json

import polars as pl
import pytest

from nfl_edge.config import ROOT

pytestmark = pytest.mark.db


@pytest.fixture(scope="module")
def run():
    try:
        from nfl_edge.db import read_sql
        df = read_sql(
            "select run_id::text, draws_per_game from model.sim_runs where season = 2025 and week = 10 "
            "order by created_at desc limit 1"
        )
    except RuntimeError as e:  # no DATABASE_URL / unreachable
        pytest.skip(str(e))
    if df.is_empty():
        pytest.skip("no 2025 wk10 sim run in this database")
    run_id = df["run_id"][0]
    pg = read_sql("select draws_path from model.proj_games where run_id = %s", (run_id,))
    if pg.is_empty() or not all((ROOT / p).exists() for p in pg["draws_path"]):
        pytest.skip("draws parquet for the newest 2025 wk10 run is not on disk")
    return {"run_id": run_id, "draws": int(df["draws_per_game"][0]), "games": pg.height}


def test_edges_cover_every_snapshot_with_parity(run):
    from nfl_edge.db import read_sql
    from nfl_edge.market import edge

    stats = edge.run(run["run_id"])
    ok, checked = (int(x) for x in stats["parity"].split("/"))
    assert checked == run["games"] == 14 and ok == checked
    e = read_sql(
        "select market_line_id, market_type, side, model_prob::float8 p, market_prob::float8 m, edge::float8 e, "
        "kelly_fraction::float8 k, p_push::float8 push from model.edges where run_id = %s",
        (run["run_id"],),
    )
    snaps = read_sql(
        "select count(*) n from raw.market_lines where game_id in "
        "(select game_id from model.proj_games where run_id = %s)", (run["run_id"],)
    )["n"][0]
    assert e.height == snaps * 6
    per = e.group_by(["market_line_id", "market_type"]).agg(pl.col("p").sum(), pl.col("m").sum(), pl.col("e").sum())
    assert (per["p"] - 1).abs().max() < 1e-9
    assert (per["m"] - 1).abs().max() < 1e-9
    assert per["e"].abs().max() < 1e-9
    assert (e["k"] >= 0).all()
    assert ((e["push"] >= 0) & (e["push"] < 0.2)).all()


def test_verdicts_render_persist_and_match_json(run):
    from nfl_edge.db import read_sql
    from nfl_edge.outputs import lines_io

    w, _ = lines_io.build(2025, 10, run_id=run["run_id"])
    assert len(w.games) == 14
    for g in w.games:
        assert g.status in {"ok", "warn", "fail"}
        assert len(g.sentences) in {1, 3}
    lines_io.persist(w)
    n = read_sql("select count(*) n from model.verdicts where run_id = %s", (run["run_id"],))["n"][0]
    assert n == 14
    payload = json.loads(json.dumps(w.to_dict()))  # what --json emits
    assert set(payload) == {"run", "summary", "games"}
    assert payload["run"]["run_id"] == run["run_id"] and payload["run"]["draws"] == run["draws"]
    for g in payload["games"]:
        assert set(g) >= {"game_id", "home", "away", "kickoff", "status", "sentences", "chips", "max_edge",
                          "fair", "market", "edges", "week_summary"}
    stored = read_sql(
        "select game_id, payload from model.verdicts where run_id = %s", (run["run_id"],)
    )
    by_game = {r["game_id"]: r["payload"] for r in stored.iter_rows(named=True)}
    for g in payload["games"]:
        s = by_game[g["game_id"]]
        s = json.loads(s) if isinstance(s, str) else s
        assert s["sentences"] == g["sentences"]
        assert s["chips"] == g["chips"]
        assert s["max_edge"] == pytest.approx(g["max_edge"])
