"""RTS projection ingest into raw.external_players. Pure; no database."""
from pathlib import Path

import polars as pl
import pytest

from nfl_edge.benchmark import rts_players as P
from nfl_edge.ingest import rts_status as R

FIX = Path(__file__).parent / "fixtures" / "rts_sample.csv"

CATALOG = pl.DataFrame({
    "gsis_id": ["00-TEST01", "00-TEST07"],
    "display_name": ["Test Back", "Star Back"],
    "merge_name": ["test back", "star back"],
    "latest_team": ["DEN", "IND"],
    "position": ["RB", "RB"],
})
TEAMS = {t: {"city": t, "nick": t} for t in
         ["DEN", "JAX", "BUF", "IND", "KC", "LAR"]}


def test_csv_path_matches_ops_name():
    assert P.csv_path(2026, 2).name == "rts_projections_2026_week02.csv"


def test_from_rts_keeps_proj_as_fpts_dk_and_matches():
    raw = R.parse_rts_csv(FIX)
    rows, unmatched = P.from_rts(raw, CATALOG, {}, TEAMS)
    star = next(r for r in rows if r["name"] == "Star Back")
    assert star["player_id"] == "00-TEST07"
    assert star["fpts_dk"] == pytest.approx(21.4)
    assert star["team"] == "IND"
    assert star["opponent"] == "KC"
    assert star["source"] == "rts"
    ghost = next(r for r in rows if r["name"] == "Ghost Player")
    assert ghost["player_id"] is None
    assert any(u["name"] == "Ghost Player" for u in unmatched)


def test_dst_row_gets_team_dst_id():
    raw = [{
        "player": "Denver Broncos", "position": "DST", "team": "DEN",
        "salary": 3000, "proj": 8.2, "opp": "JAX",
    }]
    rows, unmatched = P.from_rts(raw, CATALOG, {}, TEAMS)
    assert unmatched == []
    assert rows[0]["player_id"] == "DEN_DST"
    assert rows[0]["fpts_dk"] == pytest.approx(8.2)


def test_db_frame_source_is_rts():
    rows, _ = P.from_rts(R.parse_rts_csv(FIX), CATALOG, {}, TEAMS)
    frame = P.to_db_frame(rows, 2026, 2)
    assert set(frame["source"].to_list()) == {"rts"}
    star = frame.filter(pl.col("name") == "Star Back")
    assert star["fpts_dk"][0] == pytest.approx(21.4)
