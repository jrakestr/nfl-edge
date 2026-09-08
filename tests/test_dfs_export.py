"""Spec for outputs/dfs_export.py: NFL-DFS-Tools working dir from the same draws. No database."""
from __future__ import annotations

import json
from pathlib import Path

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
