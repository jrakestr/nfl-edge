"""FantasyPros weekly rankings -> raw.fantasypros_snapshots. Pure; no database."""
import json
from datetime import UTC, datetime
from pathlib import Path

import polars as pl
import pytest

from nfl_edge.benchmark import fantasypros as B
from nfl_edge.ingest import fantasypros_rankings as R

FIX = Path(__file__).parent / "fixtures"
TEAMS = {t: {"city": t, "nick": t} for t in ["ARI", "ATL", "PIT", "CIN", "KC", "JAX", "LA"]}
CATALOG = pl.DataFrame({
    "gsis_id": ["00-0000010"],
    "display_name": ["Aaron Rodgers"],
    "merge_name": ["aaron rodgers"],
    "latest_team": ["PIT"],
    "position": ["QB"],
})


def rank() -> dict:
    return json.loads((FIX / "fantasypros_rankings_2026_w05.json").read_text())


def test_rank_rows_keep_offense_and_dst_only():
    resp = rank()
    resp["players"].append({
        "id": 1, "player_name": "Some Linebacker", "position_id": "LB", "team_id": "KC",
        "rank": {"ECR": {"STD": {"LB": 3}}},
    })
    rows, _ = R.rank_rows(resp, {"9001": "00-0000010"}, CATALOG, {}, TEAMS)
    assert {r["position"] for r in rows} <= {"QB", "RB", "WR", "TE", "K", "DST"}
    assert not any(r["name"] == "Some Linebacker" for r in rows)


def test_rank_rows_match_and_dst_id():
    rows, unmatched = R.rank_rows(rank(), {"9001": "00-0000010"}, CATALOG, {}, TEAMS)
    rodgers = next(r for r in rows if r["name"] == "Aaron Rodgers")
    assert rodgers["player_id"] == "00-0000010"
    ari = next(r for r in rows if r["name"] == "Arizona Cardinals")
    assert ari["player_id"] == "ARI_DST"
    assert any(u["name"] == "Joe Flacco" for u in unmatched)


def test_rank_payload_is_the_rank_block():
    rows, _ = R.rank_rows(rank(), {}, CATALOG, {}, TEAMS)
    at = datetime(2026, 10, 6, 2, 47, tzinfo=UTC)
    df = B.to_snapshot_frame(rows, "rankings", 2026, 5, at, payload_key="rank")
    p = json.loads(df.filter(pl.col("name") == "Aaron Rodgers")["payload"][0])
    assert p["ECR"]["STD"]["QB"] == 19
    assert set(df["endpoint"]) == {"rankings"}


def test_run_fails_closed_before_writes(monkeypatch):
    class Boom:
        calls = 0

        def rankings(self, season, week):
            from nfl_edge.ingest.fantasypros import FantasyProsError
            raise FantasyProsError("FantasyPros /nfl/2026/rankings returned HTTP 403; nothing written")

    wrote = []
    monkeypatch.setattr("nfl_edge.db.insert", lambda *a, **k: wrote.append(a))
    with pytest.raises(Exception, match="nothing written"):
        R.run(2026, 5, client=Boom())
    assert wrote == []
