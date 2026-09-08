"""Parse NFL-DFS-Tools optimizer/GPP output. No subprocess, no database."""
from pathlib import Path

import pytest

from nfl_edge.dfs import parse as P

OPTO = """QB,RB,RB,WR,WR,WR,TE,FLEX,DST,Salary,Fpts Proj,Fpts Used,Ceiling,Own. Sum,Own. Product,STDDEV,Stack
Jahmyr Gibbs (111),Saquon Barkley (222),Bijan Robinson (333),Ja'Marr Chase (444),Amon-Ra St. Brown (555),Puka Nacua (666),Sam LaPorta (777),Justin Jefferson (888),Rams (999),50000,140.1,139.9,180,80,0.01,40,DET 3
Patrick Mahomes (101),Jahmyr Gibbs (111),Bijan Robinson (333),Ja'Marr Chase (444),Amon-Ra St. Brown (555),Puka Nacua (666),Sam LaPorta (777),Justin Jefferson (888),Rams (999),49800,138.0,137.5,175,75,0.02,38,KC 3
"""

GPP = """QB,RB,RB,WR,WR,WR,TE,FLEX,DST,Fpts Proj,Field Fpts Proj,Ceiling,Salary,Win %,Top 10%,ROI%,Proj. Own. Product,Avg. Return,Stack1 Type,Stack2 Type,Players vs DST,Lineup Type, Sim Dupes
Jahmyr Gibbs,Saquon Barkley,Bijan Robinson,Ja'Marr Chase,Amon-Ra St. Brown,Puka Nacua,Sam LaPorta,Justin Jefferson,Rams,140.1,140,180,50000,12.5,30.0,45.0,0.01,2.1,DET 3,,0,opto,1
"""

GPP_IDS = """QB,RB,RB,WR,WR,WR,TE,FLEX,DST,Fpts Proj,Field Fpts Proj,Ceiling,Salary,Win %,Top 10%,ROI%,Proj. Own. Product,Avg. Return,Stack1 Type,Stack2 Type,Players vs DST,Lineup Type, Sim Dupes
jahmyr gibbs (111),saquon barkley (222),bijan robinson (333),ja'marr chase (444),amon-ra st. brown (555),puka nacua (666),sam laporta (777),justin jefferson (888),rams (999),140.1,140,180,50000,12.5,30.0,45.0,0.01,2.1,DET 3,,0,opto,1
"""

EXPOSURE = """Player,Position,Team,Win%,Top1%,Sim. Own%,Proj. Own%,Avg. Return
Jahmyr Gibbs,RB,DET,20.0,5.0,40.0,25.0,1.2
Puka Nacua,WR,LAR,8.0,1.0,20.0,10.0,0.4
"""

SLATE = [
    {"name": "Jahmyr Gibbs", "player_dk_id": "111", "player_id": "00-g"},
    {"name": "Puka Nacua", "player_dk_id": "666", "player_id": "00-p"},
    {"name": "Rams", "player_dk_id": "999", "player_id": "LA_DST"},
]


SD_OPTO = """CPT,FLEX,FLEX,FLEX,FLEX,FLEX,Salary,Fpts Proj,Fpts Used,Ceiling,Own. Product,Own. Sum,STDDEV,Stack Type
Jaxon Smith-Njigba (43782097),Drake Maye (43782035),A.J. Brown (43782036),Sam Darnold (43782037),Rhamondre Stevenson (43782038),Seahawks (43782050),49800,90.1,89.9,120,0.01,80,40,SEA 4
"""

SD_GPP = """Type,CPT,FLEX,FLEX,FLEX,FLEX,FLEX,Salary,Fpts Proj,Field Fpts Proj,Ceiling,Primary Stack,Secondary Stack,Players vs DST,Win %,Top 10%,Cash %,Proj. Own. Product,Proj. Own. Sum,ROI%,ROI$,Num Dupes
opto,Jaxon Smith-Njigba (43782097),Drake Maye (43782035),A.J. Brown (43782036),Sam Darnold (43782037),Rhamondre Stevenson (43782038),Seahawks (43782050),49800,90.1,90,120,SEA,NE,0,18.0,40.0,50.0,0.01,80,22.0,1.1,1
"""


def test_parse_opto_keeps_cell_ids(tmp_path: Path):
    p = tmp_path / "opto.csv"
    p.write_text(OPTO)
    rows = P.parse_opto_csv(p)
    assert len(rows) == 2
    assert rows[0]["dk_ids"][0] == "111"
    assert rows[0]["names"][8] == "Rams"
    assert rows[0]["dk_ids"][8] == "999"
    assert rows[0]["salary_used"] == 50000
    assert rows[0]["stack"] == "DET 3"


def test_parse_showdown_opto_six_slots(tmp_path: Path):
    p = tmp_path / "sd_opto.csv"
    p.write_text(SD_OPTO)
    rows = P.parse_opto_csv(p)
    assert len(rows) == 1
    assert rows[0]["slots"][0] == "CPT"
    assert rows[0]["slots"][1:] == ["FLEX", "FLEX2", "FLEX3", "FLEX4", "FLEX5"]
    assert rows[0]["dk_ids"][0] == "43782097"
    assert rows[0]["salary_used"] == 49800
    assert rows[0]["proj_fpts"] == 90.1


def test_parse_showdown_gpp_skips_type_column(tmp_path: Path):
    p = tmp_path / "sd_gpp.csv"
    p.write_text(SD_GPP)
    row = P.parse_gpp_csv(p)[0]
    assert row["names"][0] == "Jaxon Smith-Njigba"
    assert row["dk_ids"][0] == "43782097"
    assert len(row["dk_ids"]) == 6
    assert row["win_pct"] == 0.18
    assert row["roi"] == 0.22


SD_EXPOSURE = """Player,Roster Position,Position,Team,Win%,Top10%,Sim. Own%,Proj. Own%,Avg. Return
Jaxon Smith-Njigba,CPT,WR,SEA,10.0,2.0,20.0,8.0,0.5
Jaxon Smith-Njigba,FLEX,WR,SEA,12.0,3.0,30.0,16.0,0.4
"""

SD_SLATE = [
    {"name": "Jaxon Smith-Njigba", "player_dk_id": "43782097", "player_id": "00-jsn"},
    {"name": "Jaxon Smith-Njigba", "player_dk_id": "43782034", "player_id": "00-jsn"},
]


def test_showdown_exposure_collapses_cpt_and_flex(tmp_path: Path):
    e = tmp_path / "sd_exp.csv"
    e.write_text(SD_EXPOSURE)
    exp = P.parse_exposure_csv(e, SD_SLATE)
    assert len(exp) == 1
    assert exp[0]["player_id"] == "00-jsn"
    assert exp[0]["sim_own"] == pytest.approx(0.50)
    assert exp[0]["proj_own"] == pytest.approx(0.16)
    assert abs(exp[0]["leverage"] - 0.34) < 1e-9


def test_showdown_upload_header():
    p_rows = [{
        "names": ["Jaxon Smith-Njigba", "Drake Maye"],
        "dk_ids": ["43782097", "43782035"],
        "slots": ["CPT", "FLEX"],
    }]
    text = P.upload_csv(p_rows, run_id="run-sd", slate_id="2026_01_showdown")
    assert text.splitlines()[1] == "CPT,FLEX,FLEX,FLEX,FLEX,FLEX"
    assert "43782097" in text


def test_upload_csv_uses_slate_ids_not_another_slate(tmp_path: Path):
    p = tmp_path / "opto.csv"
    p.write_text(OPTO)
    rows = P.parse_opto_csv(p)
    # A different slate would have Gibbs as 0001; upload must keep 111 from this opto file.
    other = {"Jahmyr Gibbs": "0001"}
    text = P.upload_csv(rows, run_id="abc-run", slate_id="2026_01_full", alias_ids=other)
    assert "abc-run" in text
    assert "2026_01_full" in text
    assert "111" in text.splitlines()[2]
    assert "0001" not in text


def test_merge_sim_stats_by_slate_ids_ignores_case():
    opto_rows = [{
        "names": ["Jahmyr Gibbs", "Rams"],
        "dk_ids": ["111", "999"],
        "win_pct": None, "roi": None,
    }]
    gpp_rows = [{
        "names": ["jahmyr gibbs", "rams"],
        "dk_ids": ["111", "999"],
        "win_pct": 0.12, "roi": 0.4,
    }]
    merged = P.merge_sim_stats(opto_rows, gpp_rows)
    assert merged[0]["win_pct"] == 0.12
    assert merged[0]["roi"] == 0.4


def test_parse_gpp_strips_lowercase_name_ids(tmp_path: Path):
    g = tmp_path / "gpp.csv"
    g.write_text(GPP_IDS)
    row = P.parse_gpp_csv(g)[0]
    assert row["names"][0] == "jahmyr gibbs"
    assert row["dk_ids"][0] == "111"
    assert row["dk_ids"][8] == "999"
    assert row["win_pct"] == 0.125


def test_parse_gpp_and_exposure(tmp_path: Path):
    g = tmp_path / "gpp.csv"
    e = tmp_path / "exp.csv"
    g.write_text(GPP)
    e.write_text(EXPOSURE)
    lineups = P.parse_gpp_csv(g)
    assert lineups[0]["win_pct"] == 0.125
    assert lineups[0]["roi"] == 0.45
    assert lineups[0]["names"][0] == "Jahmyr Gibbs"
    exp = P.parse_exposure_csv(e, SLATE)
    by_id = {r["player_id"]: r for r in exp}
    assert by_id["00-g"]["sim_own"] == 0.40
    assert by_id["00-p"]["proj_own"] == 0.10
    assert abs(by_id["00-p"]["leverage"] - 0.10) < 1e-9
