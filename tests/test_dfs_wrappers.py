"""Parse NFL-DFS-Tools optimizer/GPP output. No subprocess, no database."""
import shutil
from pathlib import Path

import pytest

from nfl_edge.dfs import parse as P
from nfl_edge.dfs import pipeline as Pipe
from nfl_edge.dfs import run_optimizer as O

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
Jahmyr Gibbs,RB,DET,$8000,22.5,20.0%,5.0%,40.0%,$1.2
Puka Nacua,WR,LAR,$7800,18.0,8.0%,1.0%,20.0%,$0.4
dolphins,DST,MIA,$2700,7.67755,46.44%,61.34%,43.33%,$15.7
"""

SLATE = [
    {"name": "Jahmyr Gibbs", "player_dk_id": "111", "player_id": "00-g"},
    {"name": "Puka Nacua", "player_dk_id": "666", "player_id": "00-p"},
    {"name": "Rams", "player_dk_id": "999", "player_id": "LA_DST"},
    {"name": "dolphins", "player_dk_id": "2700", "player_id": "MIA_DST"},
]


SD_OPTO = """CPT,FLEX,FLEX,FLEX,FLEX,FLEX,Salary,Fpts Proj,Fpts Used,Ceiling,Own. Product,Own. Sum,STDDEV,Stack Type
Jaxon Smith-Njigba (43782097),Drake Maye (43782035),A.J. Brown (43782036),Sam Darnold (43782037),Rhamondre Stevenson (43782038),Seahawks (43782050),49800,90.1,89.9,120,0.01,80,40,SEA 4
"""

SD_GPP = """Type,CPT,FLEX,FLEX,FLEX,FLEX,FLEX,Salary,Fpts Proj,Field Fpts Proj,Ceiling,Primary Stack,Secondary Stack,Players vs DST,Win %,Top 10%,Cash %,Proj. Own. Product,Proj. Own. Sum,ROI%,ROI$,Num Dupes
opto,Jaxon Smith-Njigba (43782097),Drake Maye (43782035),A.J. Brown (43782036),Sam Darnold (43782037),Rhamondre Stevenson (43782038),Seahawks (43782050),49800,90.1,90,120,SEA,NE,0,18.0,40.0,50.0,0.01,80,22.0,1.1,1
"""


def test_lineup_json_stores_settings():
    row = {
        "slots": ["QB", "RB"],
        "names": ["A", "B"],
        "dk_ids": ["1", "2"],
        "stack": "KC 2",
    }
    body = P.lineup_json(row, {"randomness": 25, "max_exposure": 40, "stacks_pct": 65, "num_uniques": 3})
    assert body["settings"]["max_exposure"] == 40
    assert body["players"][0]["name"] == "A"


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


def test_pct_sub_one_percent_keeps_percent_scale():
    assert P._pct("0.46%") == pytest.approx(0.0046)
    assert P._pct("0.09%") == pytest.approx(0.0009)
    assert P._pct("12.5%") == pytest.approx(0.125)
    assert P._pct("12.5") == pytest.approx(0.125)


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
    assert exp[0]["own_field_sim"] == pytest.approx(0.50)
    assert exp[0]["own_field_proj"] == pytest.approx(0.16)
    assert exp[0]["win_pct"] == pytest.approx(0.12)


def test_showdown_upload_header():
    p_rows = [{
        "names": ["Jaxon Smith-Njigba", "Drake Maye"],
        "dk_ids": ["43782097", "43782035"],
        "slots": ["CPT", "FLEX"],
    }]
    text = P.upload_csv(p_rows, run_id="run-sd", slate_id="2026_01_showdown")
    assert text.splitlines()[0] == "CPT,FLEX,FLEX,FLEX,FLEX,FLEX"
    assert "43782097" in text
    assert not text.startswith("#")


def test_upload_csv_uses_slate_ids_not_another_slate(tmp_path: Path):
    p = tmp_path / "opto.csv"
    p.write_text(OPTO)
    rows = P.parse_opto_csv(p)
    # A different slate would have Gibbs as 0001; upload must keep 111 from this opto file.
    other = {"Jahmyr Gibbs": "0001"}
    text = P.upload_csv(rows, run_id="abc-run", slate_id="2026_01_full", alias_ids=other)
    assert text.splitlines()[0] == "QB,RB,RB,WR,WR,WR,TE,FLEX,DST"
    assert "abc-run" not in text
    assert "111" in text.splitlines()[1]
    assert "0001" not in text


def test_upload_filename_and_stamp_from_path():
    name = P.upload_filename("2026_01_full", "e7a5ff4e-abcd-1234", "sim")
    assert name == "dk_upload_2026_01_full_e7a5ff4e_sim.csv"
    stamp = P.parse_upload_stamp(
        Path("data/dfs/e7a5ff4e-abcd-1234/dk/full") / name
    )
    assert stamp["slate_id"] == "2026_01_full"
    assert stamp["run_id_prefix"] == "e7a5ff4e"
    assert stamp["source"] == "sim"
    assert stamp["run_id"] == "e7a5ff4e-abcd-1234"


def test_upload_filename_user_optimized():
    name = P.upload_filename("2026_01_main", "abc-run", "user-optimized")
    assert name == "dk_upload_2026_01_main_abc-run_user-optimized.csv"
    stamp = P.parse_upload_stamp(name)
    assert stamp["slate_id"] == "2026_01_main"
    assert stamp["run_id_prefix"] == "abc-run"
    assert stamp["source"] == "user-optimized"
    assert stamp["run_id"] is None


def test_upload_filename_single():
    name = P.upload_filename("2026_02_main", "e7a5ff4e-abcd", "single")
    assert name == "dk_upload_2026_02_main_e7a5ff4e_single.csv"
    assert P.parse_upload_stamp(name)["source"] == "single"


def test_rescore_mean_fpts_replaces_adjusted_objective():
    lineups = [{
        "dk_ids": ["111", "222"],
        "slots": ["QB", "RB"],
        "proj_fpts": 99.0,
        "names": ["A", "B"],
    }]
    out = P.rescore_mean_fpts(lineups, {"111": 20.0, "222": 12.0})
    assert out[0]["proj_fpts"] == pytest.approx(32.0)


def test_rescore_mean_fpts_captain_is_one_and_a_half():
    lineups = [{
        "dk_ids": ["111", "222"],
        "slots": ["CPT", "FLEX"],
        "proj_fpts": 50.0,
        "names": ["A", "B"],
    }]
    out = P.rescore_mean_fpts(lineups, {"111": 20.0, "222": 10.0}, showdown=True)
    assert out[0]["proj_fpts"] == pytest.approx(40.0)


def test_persist_delete_is_construction_scoped(monkeypatch):
    deleted: list[tuple] = []
    inserted: list[str] = []

    def fake_execute(sql, params=None):
        deleted.append((sql, params))

    def fake_insert(df, table):
        inserted.append(table)
        assert "construction" in df.columns
        return len(df)

    monkeypatch.setattr(Pipe, "execute", fake_execute)
    monkeypatch.setattr(Pipe, "insert", fake_insert)
    lineups = [{
        "lineup_id": "0", "proj_fpts": 120, "win_pct": None, "roi": None,
        "salary_used": 50000, "stack": "KC 2",
        "slots": ["QB"], "names": ["A"], "dk_ids": ["1"],
    }]
    Pipe.persist("rid", "dk", "2026_02_main", "classic", lineups, [], construction="cash")
    lineup_deletes = [d for d in deleted if "dfs_lineups" in d[0]]
    assert lineup_deletes
    assert lineup_deletes[0][1] == ("rid", "dk", "2026_02_main", "cash")
    assert not any("dfs_exposure" in d[0] for d in deleted)
    assert "model.dfs_exposure" not in inserted


def test_persist_mass_rewrites_exposure(monkeypatch):
    deleted: list[str] = []

    def fake_execute(sql, params=None):
        deleted.append(sql)

    monkeypatch.setattr(Pipe, "execute", fake_execute)
    monkeypatch.setattr(Pipe, "insert", lambda df, table: len(df))
    Pipe.persist("rid", "dk", "2026_02_main", "classic", [], [
        {"player_id": "00-a", "own_ours": 0.1},
    ], construction="mass")
    assert any("dfs_exposure" in s for s in deleted)


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
    assert by_id["00-g"]["own_field_sim"] == pytest.approx(0.40)
    assert by_id["00-g"]["win_pct"] == pytest.approx(0.20)
    assert by_id["00-g"]["own_field_proj"] is None
    assert by_id["00-p"]["own_field_sim"] == pytest.approx(0.20)
    mia = by_id["MIA_DST"]
    assert mia["win_pct"] == pytest.approx(0.4644)
    assert mia["own_field_sim"] == pytest.approx(0.4333)
    assert mia["roi"] == pytest.approx(15.7)
    assert mia["own_field_proj"] is None
    assert "sim_own" not in mia
    assert "proj_own" not in mia


def test_parse_exposure_raises_on_classic_width_mismatch(tmp_path: Path):
    e = tmp_path / "exp.csv"
    e.write_text(
        "Player,Position,Team,Win%,Top1%,Sim. Own%,Proj. Own%,Avg. Return\n"
        "Jahmyr Gibbs,RB,DET,20.0,5.0,40.0,25.0,1.2\n"
    )
    with pytest.raises(ValueError, match=r"8.*9|header.*data"):
        P.parse_exposure_csv(e, SLATE)
    e.write_text(
        "Player,Position,Team,Win%,Top1%,Sim. Own%,Proj. Own%,Avg. Return\n"
        "Jahmyr Gibbs,RB,DET,$8000,22.5,20.0%,5.0%,40.0%,25.0%,$1.2\n"
    )
    with pytest.raises(ValueError, match=r"10|header.*data"):
        P.parse_exposure_csv(e, SLATE)


def test_exposure_from_lineups_rates():
    lineups = [
        {"dk_ids": ["111", "666", "999"]},
        {"dk_ids": ["111", "999"]},
    ]
    ours = P.exposure_from_lineups(lineups, SLATE)
    assert ours["00-g"] == pytest.approx(1.0)
    assert ours["00-p"] == pytest.approx(0.5)
    assert ours["LA_DST"] == pytest.approx(1.0)
    assert "MIA_DST" not in ours


def test_field_proj_from_projections(tmp_path: Path):
    p = tmp_path / "projections.csv"
    p.write_text(
        "Name,Position,Team,Salary,Fpts,Own%,StdDev\n"
        "Jahmyr Gibbs,RB,DET,8000,22.5,18.5,4.0\n"
        "Puka Nacua,WR,LAR,7800,18.0,12.0,3.0\n"
    )
    own = P.field_proj_from_projections(p, SLATE)
    assert own["00-g"] == pytest.approx(0.185)
    assert own["00-p"] == pytest.approx(0.12)


def test_merge_exposure_keeps_all_three_and_leverage_vs_field_sim():
    parsed = [
        {"player_id": "00-g", "own_field_sim": 0.40, "own_field_proj": None, "win_pct": 0.2, "roi": 1.2},
        {"player_id": "00-p", "own_field_sim": 0.20, "own_field_proj": None, "win_pct": 0.08, "roi": 0.4},
    ]
    ours = {"00-g": 0.60}
    field_proj = {"00-g": 0.185, "00-p": 0.12}
    rows = {r["player_id"]: r for r in P.merge_exposure(parsed, ours, field_proj)}
    assert rows["00-g"]["own_ours"] == pytest.approx(0.60)
    assert rows["00-g"]["own_field_proj"] == pytest.approx(0.185)
    assert rows["00-g"]["own_field_sim"] == pytest.approx(0.40)
    assert rows["00-g"]["leverage"] == pytest.approx(0.20)
    assert rows["00-p"]["own_ours"] == pytest.approx(0.0)
    assert rows["00-p"]["leverage"] == pytest.approx(-0.20)


def test_field_is_self_flags_own_lineups_as_field():
    rows = [
        {"player_id": "a", "own_ours": 0.40, "own_field_sim": 0.40},
        {"player_id": "b", "own_ours": 0.32, "own_field_sim": 0.32},
        {"player_id": "c", "own_ours": 1 / 150, "own_field_sim": 0.0067},
        {"player_id": "d", "own_ours": 0.0, "own_field_sim": 0.0},
    ]
    assert P.field_is_self(rows) is True


def test_field_is_self_passes_a_generated_field():
    rows = [
        {"player_id": "a", "own_ours": 0.40, "own_field_sim": 0.294},
        {"player_id": "b", "own_ours": 0.32, "own_field_sim": 0.351},
        {"player_id": "c", "own_ours": 0.20, "own_field_sim": 0.20},
        {"player_id": "d", "own_ours": 0.0, "own_field_sim": 0.001},
    ]
    assert P.field_is_self(rows) is False


def test_field_is_self_with_no_rostered_rows_is_not_self():
    assert P.field_is_self([]) is False
    assert P.field_is_self([
        {"player_id": "a", "own_ours": 0.0, "own_field_sim": 0.0},
        {"player_id": "b", "own_ours": 0.0, "own_field_sim": None},
    ]) is False


def test_run_sim_stages_cid_file_command(tmp_path, monkeypatch):
    from nfl_edge.dfs import run_sim as S

    exp = tmp_path / "exp"
    exp.mkdir()
    (exp / "optimal_lineups.csv").write_text("QB\n")
    tools = tmp_path / "tools"
    (tools / "dk_data").mkdir(parents=True)
    seen: dict = {}
    monkeypatch.setattr(O, "stage", lambda _d, site="dk": tools)
    monkeypatch.setattr(O, "_run", lambda _t, args: seen.setdefault("args", args))
    gpp = tmp_path / "g.csv"
    gpp.write_text("QB\n")
    exo = tmp_path / "e.csv"
    exo.write_text("QB\n")
    monkeypatch.setattr(
        O, "_newest",
        lambda _t, prefix: gpp if "lineups" in prefix else exo,
    )
    monkeypatch.setattr(S, "parse_gpp_csv", lambda _p: [{"lineup_id": "0"}])
    monkeypatch.setattr(S, "parse_exposure_csv", lambda _p, _r: [{"player_id": "a"}])
    out = S.run(exp, site="dk", field=20000, slate_rows=[])
    assert seen["args"] == ["dk", "sim", "cid", "file", "20000"]
    assert out["lineups"] == [{"lineup_id": "0"}]
    assert (exp / "gpp_lineups.csv").is_file()
    assert (exp / "gpp_exposure.csv").is_file()


def test_run_sim_showdown_stages_sd_sim_cid_file(tmp_path, monkeypatch):
    from nfl_edge.dfs import run_sim as S

    exp = tmp_path / "exp"
    exp.mkdir()
    (exp / "optimal_lineups.csv").write_text("CPT\n")
    tools = tmp_path / "tools"
    (tools / "dk_data").mkdir(parents=True)
    seen: dict = {}
    monkeypatch.setattr(O, "stage", lambda _d, site="dk": tools)
    monkeypatch.setattr(O, "_run", lambda _t, args: seen.setdefault("args", args))
    gpp = tmp_path / "g.csv"
    gpp.write_text("CPT\n")
    exo = tmp_path / "e.csv"
    exo.write_text("CPT\n")
    monkeypatch.setattr(
        O, "_newest",
        lambda _t, prefix: gpp if "lineups" in prefix else exo,
    )
    monkeypatch.setattr(S, "parse_gpp_csv", lambda _p: [])
    monkeypatch.setattr(S, "parse_exposure_csv", lambda _p, _r: [])
    S.run(exp, site="dk", field=20000, slate_rows=[], showdown=True)
    assert seen["args"] == ["dk", "sd_sim", "cid", "file", "20000"]


def test_resolve_uv_fallback_when_not_on_path(monkeypatch, tmp_path):
    fake = tmp_path / "uv"
    fake.write_text("")
    fake.chmod(0o755)
    monkeypatch.setattr(shutil, "which", lambda _name: None)
    monkeypatch.setattr(O, "_UV_FALLBACKS", (fake,))
    assert O.resolve_uv() == str(fake)


def test_exposure_from_lineups_showdown_counts_player_once():
    lineups = [
        {"dk_ids": ["43782097", "43782034", "43782035"]},
        {"dk_ids": ["43782097", "43782035"]},
    ]
    ours = P.exposure_from_lineups(lineups, SD_SLATE)
    assert ours["00-jsn"] == pytest.approx(1.0)
