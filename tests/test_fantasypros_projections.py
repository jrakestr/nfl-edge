"""FantasyPros projections -> raw.external_players + snapshots. Pure; no database."""
import json
from datetime import UTC, datetime
from pathlib import Path

import polars as pl
import pytest

from nfl_edge.benchmark import fantasypros as B
from nfl_edge.ingest import fantasypros_match as M

FIX = Path(__file__).parent / "fixtures"
TEAMS = {t: {"city": t, "nick": t} for t in
         ["BUF", "BAL", "DAL", "DET", "ATL", "CIN", "SEA", "NYG", "ARI", "JAX", "LA", "KC", "NE", "TB"]}

CATALOG = pl.DataFrame({
    "gsis_id": ["00-0000001", "00-0000002", "00-0000003", "00-0000004", "00-0000005", "00-0000009"],
    "display_name": ["Josh Allen", "Lamar Jackson", "Trevor Lawrence", "Josh Allen", "Chase Brown", "Chase Brown"],
    "merge_name": ["josh allen", "lamar jackson", "trevor lawrence", "josh allen", "chase brown", "chase brown"],
    "latest_team": ["BUF", "BAL", "JAX", "JAX", "CIN", "CHI"],
    "position": ["QB", "QB", "QB", "LB", "RB", "WR"],
})


def proj() -> dict:
    return json.loads((FIX / "fantasypros_projections_2026_w05.json").read_text())


def test_build_fp_map_drops_ambiguous_ids():
    df = pl.DataFrame({
        "fantasypros_id": ["1", "2", "2", None],
        "gsis_id": ["00-A", "00-B", "00-C", "00-D"],
    })
    assert M.build_fp_map(df) == {"1": "00-A"}


def test_match_prefers_fp_id_then_name_with_team_alias():
    fp_map = {"17298": "00-0000001"}
    r1 = M.match_player("17298", "Josh Allen", "BUF", "QB", fp_map, CATALOG, {}, TEAMS)
    assert (r1.player_id, r1.reason) == ("00-0000001", None)
    r2 = M.match_player("17233", "Lamar Jackson", "BAL", "QB", fp_map, CATALOG, {}, TEAMS)
    assert r2.player_id == "00-0000002"
    # FantasyPros says JAC, nflverse says JAX
    r3 = M.match_player("19780", "Trevor Lawrence", "JAC", "QB", fp_map, CATALOG, {}, TEAMS)
    assert r3.player_id == "00-0000003"
    r4 = M.match_player("1", "Nobody Here", "KC", "QB", fp_map, CATALOG, {}, TEAMS)
    assert r4.player_id is None and r4.reason == "unmatched"


def test_dst_maps_to_team_dst_id():
    r = M.match_player("8000", "Arizona Cardinals", "ARI", "DST", {}, CATALOG, {}, TEAMS)
    assert r.player_id == "ARI_DST"


def test_project_rows_stats_unmatched_and_no_dk_points():
    rows, unmatched = B.project_rows(proj(), {"17298": "00-0000001"}, CATALOG, {}, TEAMS)
    allen = next(r for r in rows if r["name"] == "Josh Allen")
    assert allen["player_id"] == "00-0000001"
    assert allen["fpts_std"] == pytest.approx(22.7)
    assert allen["pass_att"] == pytest.approx(31.04)
    assert allen["pass_td"] == pytest.approx(1.73)
    assert allen["pass_int"] == pytest.approx(0.69)
    assert allen["fpts_dk"] is None
    gibbs = next(r for r in rows if r["name"] == "Jahmyr Gibbs")
    assert gibbs["fpts_ppr"] == pytest.approx(23.45)
    assert gibbs["rec"] is not None and gibbs["rec_yds"] is not None
    assert gibbs["player_id"] is None
    assert any(u["name"] == "Jahmyr Gibbs" and u["reason"] == "unmatched" for u in unmatched)
    lawrence = next(r for r in rows if r["name"] == "Trevor Lawrence")
    assert lawrence["team"] == "JAX"  # stored in nflverse team codes
    assert lawrence["player_id"] == "00-0000003"


def test_ambiguous_name_is_kept_unmatched():
    resp = proj()
    resp["players"] = [{
        "fpid": 25324, "name": "Chase Brown", "position_id": "RB", "team_id": "CIN",
        "stats": {"points": 15.8, "points_ppr": 19.72},
    }]
    rows, _ = B.project_rows(resp, {}, CATALOG.filter(pl.col("gsis_id") != "00-0000009"), {}, TEAMS)
    assert rows[0]["player_id"] == "00-0000005"
    dup = CATALOG.with_columns(
        pl.when(pl.col("gsis_id") == "00-0000009").then(pl.lit("CIN")).otherwise(pl.col("latest_team")).alias("latest_team"),
        pl.when(pl.col("gsis_id") == "00-0000009").then(pl.lit("RB")).otherwise(pl.col("position")).alias("position"),
    )
    rows, unmatched = B.project_rows(resp, {}, dup, {}, TEAMS)
    assert rows[0]["player_id"] is None
    assert unmatched[0]["reason"] == "ambiguous"


def test_external_frame_schema_and_dedupe():
    rows, _ = B.project_rows(proj(), {}, CATALOG, {}, TEAMS)
    rows.append({**rows[0], "fpts_ppr": 1.0})  # same (name, team): key collision
    df, dropped = B.to_external_frame(rows, 2026, 5)
    assert dropped == 1
    assert df.select(["source", "season", "week", "name", "team"]).is_unique().all()
    assert set(df["source"]) == {"fantasypros"}
    assert {"pass_att", "pass_cmp", "rush_att", "rec", "fpts_std", "fpts_ppr", "fpts_dk"} <= set(df.columns)
    assert df["fpts_dk"].null_count() == df.height
    # keep the larger projection when keys collide
    first = rows[0]
    assert df.filter(pl.col("name") == first["name"])["fpts_ppr"][0] == pytest.approx(first["fpts_ppr"])


def test_snapshot_frame_keeps_every_row_with_fetched_at():
    rows, _ = B.project_rows(proj(), {}, CATALOG, {}, TEAMS)
    at = datetime(2026, 10, 6, 2, 47, tzinfo=UTC)
    df = B.to_snapshot_frame(rows, "projections", 2026, 5, at)
    assert df.height == len(rows)
    assert set(df["endpoint"]) == {"projections"}
    assert df["fetched_at"].n_unique() == 1
    assert json.loads(df["payload"][0])["points_ppr"] is not None
    assert df["fp_id"].is_unique().all()


def test_run_refuses_to_write_when_api_fails(monkeypatch):
    class Boom:
        calls = 0

        def projections(self, season, week):
            from nfl_edge.ingest.fantasypros import FantasyProsError
            raise FantasyProsError("FantasyPros /nfl/2026/projections returned HTTP 500; nothing written")

    wrote = []
    monkeypatch.setattr("nfl_edge.db.insert", lambda *a, **k: wrote.append(a))
    monkeypatch.setattr("nfl_edge.db.upsert", lambda *a, **k: wrote.append(a))
    with pytest.raises(Exception, match="nothing written"):
        B.run(2026, 5, client=Boom())
    assert wrote == []
