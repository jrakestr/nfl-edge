"""DK salary CSV parse, name match, and Status → player_overrides. No database."""
from pathlib import Path

import polars as pl

from nfl_edge.ingest import dk_salaries as D

FIXTURE = Path(__file__).parent / "fixtures" / "dk_salaries_sample.csv"

CATALOG = pl.DataFrame({
    "gsis_id": ["00-0033873", "00-0036900", "00-0039139", "00-0037837"],
    "display_name": ["Patrick Mahomes", "Ja'Marr Chase", "Jahmyr Gibbs", "Puka Nacua"],
    "merge_name": ["patrick mahomes", "jamarr chase", "jahmyr gibbs", "puka nacua"],
    "latest_team": ["KC", "CIN", "DET", "LA"],
    "position": ["QB", "WR", "RB", "WR"],
})

TEAMS = {
    "KC": {"city": "Kansas City", "nick": "Chiefs"},
    "CIN": {"city": "Cincinnati", "nick": "Bengals"},
    "DET": {"city": "Detroit", "nick": "Lions"},
    "LA": {"city": "Los Angeles", "nick": "Rams"},
    "LAC": {"city": "Los Angeles", "nick": "Chargers"},
}


def test_map_dk_status():
    assert D.map_dk_status(None) is None
    assert D.map_dk_status("") is None
    assert D.map_dk_status("O") == ("out", 0.0)
    assert D.map_dk_status("OUT") == ("out", 0.0)
    assert D.map_dk_status("D") == ("doubtful", 0.0)
    assert D.map_dk_status("Q") == ("questionable", 1.0)
    assert D.map_dk_status("IR") == ("out", 0.0)


def test_parse_dk_csv_sample():
    rows = D.parse_dk_csv(FIXTURE)
    assert len(rows) == 7
    by_name = {r["name"]: r for r in rows}
    assert by_name["Patrick Mahomes"]["salary"] == 8000
    assert by_name["Patrick Mahomes"]["player_dk_id"] == "43727001"
    assert by_name["Patrick Mahomes"]["avg_points"] == 24.1
    assert by_name["Patrick Mahomes"]["roster_position"] == "QB"
    assert by_name["Ja'Marr Chase"]["status"] == "Q"
    assert by_name["Ghost Player"]["status"] == "O"
    assert by_name["Chiefs"]["position"] == "DST"
    assert by_name["Jahmyr Gibbs"]["status"] == "D"
    assert by_name["IR Receiver"]["status"] == "IR"
    assert by_name["Puka Nacua"]["status"] == "OUT"
    assert by_name["Puka Nacua"]["team"] == "LAR"


def test_attach_ids_matches_and_reports_unmatched():
    rows = D.attach_ids(D.parse_dk_csv(FIXTURE), CATALOG, {}, TEAMS)
    by_name = {r["name"]: r for r in rows}
    assert by_name["Patrick Mahomes"]["player_id"] == "00-0033873"
    assert by_name["Ja'Marr Chase"]["player_id"] == "00-0036900"
    assert by_name["Jahmyr Gibbs"]["player_id"] == "00-0039139"
    assert by_name["Puka Nacua"]["player_id"] == "00-0037837"
    assert by_name["Chiefs"]["player_id"] == "KC_DST"
    assert by_name["Ghost Player"]["player_id"] is None
    assert by_name["Ghost Player"]["match_reason"] == "unmatched"
    assert by_name["IR Receiver"]["player_id"] is None


def test_overrides_from_status():
    rows = D.attach_ids(D.parse_dk_csv(FIXTURE), CATALOG, {}, TEAMS)
    ov, skipped = D.overrides_from_status(rows)
    by_id = {r["player_id"]: r for r in ov}
    assert by_id["00-0036900"]["status"] == "questionable"
    assert by_id["00-0036900"]["usage_multiplier"] == 1.0
    assert by_id["00-0039139"]["status"] == "doubtful"
    assert by_id["00-0039139"]["usage_multiplier"] == 0.0
    assert by_id["00-0037837"]["status"] == "out"
    assert by_id["00-0037837"]["usage_multiplier"] == 0.0
    assert "00-0033873" not in by_id  # blank Status
    assert "KC_DST" not in by_id
    skipped_names = {s["name"] for s in skipped}
    assert "Ghost Player" in skipped_names  # O but unmatched
    assert "IR Receiver" in skipped_names  # IR but unmatched
    assert "Patrick Mahomes" not in skipped_names


def test_overrides_from_status_dedupes_cpt_flex():
    rows = [
        {"name": "Zach Charbonnet", "player_id": "00-z", "status": "OUT", "match_reason": "ok"},
        {"name": "Zach Charbonnet", "player_id": "00-z", "status": "OUT", "match_reason": "ok"},
        {"name": "TreVeyon Henderson", "player_id": "00-h", "status": "Q", "match_reason": "ok"},
        {"name": "TreVeyon Henderson", "player_id": "00-h", "status": "Q", "match_reason": "ok"},
    ]
    ov, skipped = D.overrides_from_status(rows)
    assert skipped == []
    by_id = {r["player_id"]: r for r in ov}
    assert set(by_id) == {"00-z", "00-h"}
    assert by_id["00-z"]["status"] == "out"
    assert by_id["00-h"]["status"] == "questionable"


def test_salary_frame_keeps_unmatched():
    rows = D.attach_ids(D.parse_dk_csv(FIXTURE), CATALOG, {}, TEAMS)
    frame = D.salary_frame(rows, site="dk", slate_id="2026_01_main", slate_type="classic")
    assert frame.height == 7
    assert frame.filter(pl.col("name") == "Patrick Mahomes")["avg_points"].to_list() == [24.1]
    assert frame.filter(pl.col("name") == "Ghost Player")["player_id"].to_list() == [None]
    assert set(frame["player_dk_id"].to_list()) == {
        "43727001", "43727002", "43727003", "43727004", "43727005", "43727006", "43727007",
    }


def test_parse_dk_csv_strips_bom(tmp_path: Path):
    p = tmp_path / "bom.csv"
    p.write_text(
        "\ufeffPosition,Name,ID,Roster Position,Salary,TeamAbbrev\n"
        "WR,Jaxon Smith-Njigba,43782034,FLEX,10600,SEA\n",
        encoding="utf-8",
    )
    rows = D.parse_dk_csv(p)
    assert len(rows) == 1
    assert rows[0]["name"] == "Jaxon Smith-Njigba"
    assert rows[0]["roster_position"] == "FLEX"
    assert rows[0]["player_dk_id"] == "43782034"


def test_slate_type_full_is_classic():
    assert D.slate_type_for("main") == "classic"
    assert D.slate_type_for("full") == "classic"
    assert D.slate_type_for("showdown") == "showdown"


def test_attach_ids_dk_lar_to_nflverse_la():
    rows = D.attach_ids(D.parse_dk_csv(FIXTURE), CATALOG, {}, TEAMS)
    by_name = {r["name"]: r for r in rows}
    assert by_name["Puka Nacua"]["team"] == "LAR"
    assert by_name["Puka Nacua"]["player_id"] == "00-0037837"


def test_attach_ids_uses_persisted_crosswalk():
    rows = D.attach_ids(
        [{"name": "Ghost Player", "team": "CHI", "position": "QB", "player_dk_id": "99"}],
        CATALOG, {}, TEAMS, existing={"99": "00-0033873"},
    )
    assert rows[0]["player_id"] == "00-0033873"
