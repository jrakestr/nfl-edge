"""Spec for outputs/dfs_export.py: NFL-DFS-Tools working dir from the same draws. No database."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from nfl_edge.dfs import construction as C
from nfl_edge.outputs import dfs_export as D

SLATE = [
    {"name": "Patrick Mahomes", "player_dk_id": "43727001", "position": "QB",
     "roster_position": "QB", "team": "KC", "salary": 8000,
     "game_info": "KC@LAC 09/13/2026 01:00PM ET", "player_id": "00-0033873"},
    {"name": "Ja'Marr Chase", "player_dk_id": "43727002", "position": "WR",
     "roster_position": "WR/FLEX", "team": "CIN", "salary": 7800,
     "game_info": "TB@CIN 09/13/2026 01:00PM ET", "player_id": "00-0036900"},
    {"name": "Ghost Player", "player_dk_id": "43727003", "position": "RB",
     "roster_position": "RB/FLEX", "team": "KC", "salary": 4000,
     "game_info": "KC@LAC 09/13/2026 01:00PM ET", "player_id": None},
    {"name": "Chiefs", "player_dk_id": "43727004", "position": "DST",
     "roster_position": "DST", "team": "KC", "salary": 2900,
     "game_info": "KC@LAC 09/13/2026 01:00PM ET", "player_id": "KC_DST"},
    {"name": "Jahmyr Gibbs", "player_dk_id": "43727005", "position": "RB",
     "roster_position": "RB/FLEX", "team": "DET", "salary": 8000,
     "game_info": "NO@DET 09/13/2026 01:00PM ET", "player_id": "00-0039139"},
    {"name": "IR Receiver", "player_dk_id": "43727006", "position": "WR",
     "roster_position": "WR/FLEX", "team": "DET", "salary": 3000,
     "game_info": "NO@DET 09/13/2026 01:00PM ET", "player_id": None},
    {"name": "Puka Nacua", "player_dk_id": "43727007", "position": "WR",
     "roster_position": "WR/FLEX", "team": "LAR", "salary": 6500,
     "game_info": "NO@DET 09/13/2026 01:00PM ET", "player_id": "00-0037837"},
]

PROJ = {
    "00-0033873": {"fpts_dk_mean": 22.4, "fpts_dk_sd": 6.1, "fpts_fd_mean": 20.0, "fpts_fd_sd": 5.0},
    "00-0036900": {"fpts_dk_mean": 18.2, "fpts_dk_sd": 7.4, "fpts_fd_mean": 17.0, "fpts_fd_sd": 6.0},
    "KC_DST": {"fpts_dk_mean": 7.5, "fpts_dk_sd": 4.0, "fpts_fd_mean": 7.0, "fpts_fd_sd": 3.5},
    "00-0039139": {"fpts_dk_mean": 19.0, "fpts_dk_sd": 5.5, "fpts_fd_mean": 18.0, "fpts_fd_sd": 5.0},
    "00-0037837": {"fpts_dk_mean": 3.2, "fpts_dk_sd": 2.0, "fpts_fd_mean": 3.0, "fpts_fd_sd": 1.8},
}


def by_name(rows: list[dict]) -> dict[str, dict]:
    return {r["Name"]: r for r in rows}


def test_own_pct_higher_ranks_more_owned():
    n = 10
    hi = D.own_pct_v1(1, 1, n)
    lo = D.own_pct_v1(10, 10, n)
    mid = D.own_pct_v1(1, 10, n)
    assert 0.5 <= lo < mid < hi <= 30.0
    assert D.own_pct_v1(1, 10, n) == D.own_pct_v1(10, 1, n)


def test_map_position_dst():
    assert D.map_position("D") == "DST"
    assert D.map_position("DEF") == "DST"
    assert D.map_position("DST") == "DST"
    assert D.map_position("WR") == "WR"


def test_projections_use_mean_and_sd_and_keep_unprojected():
    rows, report = D.build_projections(SLATE, PROJ, site="dk")
    names = {r["Name"] for r in rows}
    assert names == {r["name"] for r in SLATE}
    got = by_name(rows)
    assert got["Patrick Mahomes"]["Fpts"] == 22.4
    assert got["Patrick Mahomes"]["StdDev"] == 6.1
    assert got["Patrick Mahomes"]["Salary"] == 8000
    assert got["Patrick Mahomes"]["Position"] == "QB"
    assert got["Patrick Mahomes"]["Team"] == "KC"
    assert got["Ghost Player"]["Fpts"] == 0.0
    assert got["Ghost Player"]["StdDev"] == 0.0
    unproj = {r["name"] for r in report if r["kind"] == "unprojected"}
    assert unproj == {"Ghost Player", "IR Receiver"}
    below = {r["name"] for r in report if r["kind"] == "below_projection_minimum"}
    assert "Puka Nacua" in below
    assert "Chiefs" not in below  # DST is not dropped by the tool's minimum
    assert all(0.5 <= r["Own%"] <= 30.0 for r in rows)


def test_cash_fpts_is_p25_not_mean():
    proj = {k: {**v, "p25": 8.0, "p90": 40.0, "own": 0.9} for k, v in PROJ.items()}
    rows, _ = D.build_projections(
        SLATE, proj, site="dk", construction=C.profile("classic", "cash"),
    )
    assert by_name(rows)["Patrick Mahomes"]["Fpts"] == 8.0


def test_cash_fpts_fails_closed_without_p25():
    with pytest.raises(RuntimeError, match="25th-percentile"):
        D.build_projections(SLATE, PROJ, site="dk", construction=C.profile("classic", "cash"))


def test_single_fpts_uses_named_ceiling_and_own_weights():
    p = C.profile("classic", "single")
    proj = {k: {**v, "p25": 8.0, "p90": 30.0, "own": 0.20} for k, v in PROJ.items()}
    rows, _ = D.build_projections(SLATE, proj, site="dk", construction=p)
    mean = 22.4
    expect = mean + p["ceiling_weight"] * (30.0 - mean) - p["ownership_penalty"] * 0.20
    assert by_name(rows)["Patrick Mahomes"]["Fpts"] == pytest.approx(expect)


def test_projections_fd_uses_fd_points():
    rows, _ = D.build_projections(SLATE, PROJ, site="fd")
    assert by_name(rows)["Patrick Mahomes"]["Fpts"] == 20.0
    assert by_name(rows)["Patrick Mahomes"]["StdDev"] == 5.0


def test_player_ids_keep_dk_columns_and_unmatched():
    ids = D.build_player_ids(SLATE)
    assert len(ids) == len(SLATE)
    row = next(r for r in ids if r["Name"] == "Patrick Mahomes")
    assert row["ID"] == "43727001"
    assert row["Roster Position"] == "QB"
    assert row["TeamAbbrev"] == "KC"
    assert row["Game Info"].startswith("KC@LAC")
    assert any(r["Name"] == "Ghost Player" for r in ids)


def test_correlations_keyed_by_dk_name():
    corr = [
        {"player_id_a": "00-0033873", "player_id_b": "KC_DST", "corr_dk": -0.22},
        {"player_id_a": "00-0033873", "player_id_b": "missing", "corr_dk": 0.9},
    ]
    names = {r["player_id"]: r["name"] for r in SLATE if r["player_id"]}
    out = D.build_correlations(corr, names)
    assert out["Patrick Mahomes"]["Chiefs"] == -0.22
    assert "missing" not in json.dumps(out)


SHOWDOWN_SLATE = [
    {"name": "Jaxon Smith-Njigba", "player_dk_id": "43782097", "position": "WR",
     "roster_position": "CPT", "team": "SEA", "salary": 15900,
     "game_info": "NE@SEA 09/09/2026 08:20PM ET", "player_id": "00-jsn"},
    {"name": "Jaxon Smith-Njigba", "player_dk_id": "43782034", "position": "WR",
     "roster_position": "FLEX", "team": "SEA", "salary": 10600,
     "game_info": "NE@SEA 09/09/2026 08:20PM ET", "player_id": "00-jsn"},
    {"name": "Seahawks", "player_dk_id": "43782117", "position": "DST",
     "roster_position": "CPT", "team": "SEA", "salary": 6600,
     "game_info": "NE@SEA 09/09/2026 08:20PM ET", "player_id": "SEA_DST"},
    {"name": "Seahawks", "player_dk_id": "43782050", "position": "DST",
     "roster_position": "FLEX", "team": "SEA", "salary": 4400,
     "game_info": "NE@SEA 09/09/2026 08:20PM ET", "player_id": "SEA_DST"},
]
SHOWDOWN_PROJ = {
    "00-jsn": {"fpts_dk_mean": 20.0, "fpts_dk_sd": 6.0, "fpts_fd_mean": 18.0, "fpts_fd_sd": 5.0},
    "SEA_DST": {"fpts_dk_mean": 8.0, "fpts_dk_sd": 4.0, "fpts_fd_mean": 7.0, "fpts_fd_sd": 3.0},
}


def test_showdown_projections_one_row_flex_salary_unmultiplied():
    rows, _ = D.build_projections(SHOWDOWN_SLATE, SHOWDOWN_PROJ, site="dk", showdown=True)
    by = by_name(rows)
    assert set(by) == {"Jaxon Smith-Njigba", "Seahawks"}
    assert by["Jaxon Smith-Njigba"]["Salary"] == 10600
    assert by["Jaxon Smith-Njigba"]["Fpts"] == 20.0
    assert by["Jaxon Smith-Njigba"]["Position"] == "WR"
    assert by["Seahawks"]["Salary"] == 4400
    assert D.captain_fpts(20.0, "dk") == 30.0


def test_showdown_player_ids_keep_cpt_and_flex():
    ids = D.build_player_ids(SHOWDOWN_SLATE)
    assert len(ids) == 4
    jsn = [r for r in ids if r["Name"] == "Jaxon Smith-Njigba"]
    assert {r["Roster Position"] for r in jsn} == {"CPT", "FLEX"}
    assert {r["ID"] for r in jsn} == {"43782097", "43782034"}


def test_showdown_config_uses_showdown_json():
    cfg = D.build_config([], {}, showdown=True)
    assert cfg["global_team_limit"] == 5
    assert cfg["min_lineup_salary"] == 0
    assert cfg["allow_qb_vs_dst"] is True
    assert cfg["allow_def_vs_qb_cpt"] is True
    assert cfg["stack_rules"]["pair"] == []


def test_showdown_export_uses_20k_contest(tmp_path: Path):
    D.write_export(tmp_path, [], [], D.build_config([], {}, showdown=True), [], showdown=True)
    header, row = (tmp_path / "contest_structure.csv").read_text().splitlines()[:2]
    assert "Field Size" in header
    assert "20000" in row
    assert "150" not in row.split(",")


def test_injury_out_is_dropped_even_when_above_the_floor():
    slate = [
        {**SLATE[0]},
        {**SLATE[1], "player_id": "00-0036900"},
    ]
    proj = {
        "00-0033873": {"fpts_dk_mean": 22.4, "fpts_dk_sd": 6.1},
        "00-0036900": {"fpts_dk_mean": 14.2, "fpts_dk_sd": 5.0},
    }
    kept, dropped = D.drop_injured(slate, proj, {"00-0036900": "out"}, site="dk")
    assert [r["name"] for r in kept] == ["Patrick Mahomes"]
    assert dropped == [{
        "kind": "injury_out",
        "name": "Ja'Marr Chase",
        "team": "CIN",
        "position": "WR",
        "player_id": "00-0036900",
        "status": "out",
        "fpts": 14.2,
    }]
    rows, report = D.build_projections(kept, proj, site="dk")
    assert "Ja'Marr Chase" not in {r["Name"] for r in rows}
    assert all(r["kind"] != "injury_out" for r in report)


def test_injury_keeps_questionable_and_drops_ir_and_doubtful():
    overrides = {"00-0033873": "questionable", "00-0036900": "IR", "00-0039139": "doubtful"}
    kept, dropped = D.drop_injured(SLATE, PROJ, overrides, site="dk")
    names = {r["name"] for r in kept}
    assert "Patrick Mahomes" in names
    assert {d["name"] for d in dropped} == {"Ja'Marr Chase", "Jahmyr Gibbs"}
    assert {d["status"].lower() for d in dropped} == {"ir", "doubtful"}


def test_classic_config_has_uniques_and_exposure_cap():
    cfg = D.build_config([], {}, showdown=False)
    assert cfg["num_uniques"] == 3
    assert cfg["max_exposure"] == 40
    assert D.uniques_from_config(cfg) == 3
    assert D.exposure_cap_count(cfg["max_exposure"], 150) == 60


def test_two_game_slate_raises_exposure_so_150_lineups_stay_feasible():
    assert D.exposure_for_slate(40, n_games=8, n_lineups=150) == 40
    assert D.exposure_for_slate(40, n_games=2, n_lineups=150) == 80
    assert D.exposure_for_slate(40, n_games=2, n_lineups=20) == 40
    assert D.exposure_cap_count(80, 150) == 120


def test_write_export_three_files(tmp_path: Path):
    proj, report = D.build_projections(SLATE, PROJ, site="dk")
    ids = D.build_player_ids(SLATE)
    names = {r["player_id"]: r["name"] for r in SLATE if r["player_id"]}
    cfg = D.build_config(
        [{"player_id_a": "00-0033873", "player_id_b": "KC_DST", "corr_dk": 0.4}],
        names,
    )
    D.write_export(tmp_path, proj, ids, cfg, report)
    assert (tmp_path / "projections.csv").is_file()
    assert (tmp_path / "player_ids.csv").is_file()
    assert (tmp_path / "config.json").is_file()
    text = (tmp_path / "projections.csv").read_text()
    assert text.splitlines()[0] == "Name,Position,Team,Salary,Fpts,Own%,StdDev"
    assert "Ghost Player" in text
    dumped = json.loads((tmp_path / "config.json").read_text())
    assert dumped["custom_correlations"]["Patrick Mahomes"]["Chiefs"] == 0.4
    assert dumped["projection_path"] == "projections.csv"
    assert (tmp_path / "contest_structure.csv").is_file()
    report_text = (tmp_path / "report.txt").read_text()
    assert "Ghost Player" in report_text
    assert "Puka Nacua" in report_text


def _structure_rows(path: Path) -> list[dict]:
    import csv as _csv

    with path.open(newline="") as f:
        return list(_csv.DictReader(f))


def test_classic_gpp_contest_is_a_real_large_field_room(tmp_path: Path):
    D.write_export(tmp_path, [], [], D.build_config([], {}), [])
    rows = _structure_rows(tmp_path / "contest_structure.csv")
    assert len(rows) > 10
    assert {r["Field Size"] for r in rows} == {"176470"}
    assert {r["Entry Fee"] for r in rows} == {"20"}
    assert rows[0]["Place"] == "1" and rows[0]["Payout"] == "1000000"


def test_classic_single_contest_selects_the_single_entry_room(tmp_path: Path):
    D.write_export(tmp_path, [], [], D.build_config([], {}), [], contest="single")
    rows = _structure_rows(tmp_path / "contest_structure.csv")
    assert len(rows) > 10
    assert {r["Field Size"] for r in rows} == {"16646"}
    assert {r["Entry Fee"] for r in rows} == {"5"}
    assert rows[0]["Place"] == "1" and rows[0]["Payout"] == "7500"


def test_unknown_contest_name_fails_closed(tmp_path: Path):
    with pytest.raises(ValueError, match="unknown contest"):
        D.write_export(tmp_path, [], [], D.build_config([], {}), [], contest="bogus")


def test_field_size_must_exceed_lineups_entered(tmp_path: Path):
    tiny = tmp_path / "tiny.csv"
    tiny.write_text("Place,Payout,Field Size,Entry Fee\n1,1000,150,20\n")
    with pytest.raises(RuntimeError, match="field size 150 <= 150 lineups"):
        D.require_field_larger_than_entries(tiny, 150)
    assert D.require_field_larger_than_entries(
        D.contest_path("gpp"), 150) == 176470
    assert D.require_field_larger_than_entries(
        D.contest_path("single"), 1) == 16646


def test_exported_field_size_exceeds_entries(tmp_path: Path):
    D.write_export(tmp_path, [], [], D.build_config([], {}), [])
    assert D.contest_field_size(tmp_path / "contest_structure.csv") > 150
    D.write_export(tmp_path, [], [], D.build_config([], {}), [], contest="single")
    assert D.contest_field_size(tmp_path / "contest_structure.csv") > 1
