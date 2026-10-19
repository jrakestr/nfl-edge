"""Solver-independent DK lineup audit. Salaries and positions come from the slate, never the optimizer."""
from __future__ import annotations

import pytest

from nfl_edge.dfs import validate as V

GI_A = "ATL@NO 10/05/2026 01:00PM ET"
GI_B = "TB@DAL 10/05/2026 04:25PM ET"


def _row(dk, name, pos, team, salary, gi, pid=None, rp=None):
    return {
        "player_dk_id": dk, "name": name, "position": pos, "team": team, "salary": salary,
        "game_info": gi, "player_id": pid or f"id_{dk}", "roster_position": rp or pos,
    }


@pytest.fixture
def slate() -> list[dict]:
    return [
        _row("1", "QB A", "QB", "ATL", 7000, GI_A),
        _row("2", "RB A", "RB", "ATL", 6000, GI_A),
        _row("3", "RB B", "RB", "NO", 5500, GI_A),
        _row("4", "WR A", "WR", "ATL", 6500, GI_A),
        _row("5", "WR B", "WR", "NO", 5000, GI_A),
        _row("6", "WR C", "WR", "TB", 4500, GI_B),
        _row("7", "TE A", "TE", "DAL", 4000, GI_B),
        _row("8", "RB C", "RB", "TB", 5000, GI_B),
        _row("9", "Cowboys", "DST", "DAL", 3000, GI_B, pid="DAL_DST"),
        _row("10", "WR D", "WR", "DAL", 9000, GI_B),
        _row("11", "QB B", "QB", "NO", 6000, GI_A),
        _row("12", "RB D", "RB", "DAL", 7500, GI_B),
    ]


def _lineup(ids, salary=None, slots=None):
    slots = slots or ["QB", "RB", "RB2", "WR", "WR2", "WR3", "TE", "FLEX", "DST"]
    return {"slots": slots, "names": [f"n{i}" for i in ids], "dk_ids": list(ids), "salary_used": salary}


LEGAL = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]  # 46,500


def test_legal_classic_passes(slate):
    assert V.validate_lineup(_lineup(LEGAL, 46500), V.slate_index(slate)) == []


def test_salary_over_cap(slate):
    ids = ["1", "2", "12", "4", "5", "10", "7", "8", "9"]  # 53,000
    problems = V.validate_lineup(_lineup(ids), V.slate_index(slate))
    assert any("53000" in p and "50000" in p for p in problems)


def test_reported_salary_must_match_recomputed(slate):
    problems = V.validate_lineup(_lineup(LEGAL, 46000), V.slate_index(slate))
    assert any("46000" in p and "46500" in p for p in problems)


def test_duplicate_player(slate):
    ids = ["1", "2", "2", "4", "5", "6", "7", "8", "9"]
    problems = V.validate_lineup(_lineup(ids), V.slate_index(slate))
    assert any("duplicate" in p.lower() for p in problems)


def test_wrong_position_in_slot(slate):
    ids = ["1", "2", "3", "4", "5", "6", "7", "11", "9"]  # QB in FLEX
    problems = V.validate_lineup(_lineup(ids), V.slate_index(slate))
    assert any("FLEX" in p and "QB" in p for p in problems)


def test_unknown_dk_id(slate):
    ids = ["1", "2", "3", "4", "5", "6", "7", "8", "999"]
    problems = V.validate_lineup(_lineup(ids), V.slate_index(slate))
    assert any("999" in p and "not on" in p for p in problems)


def test_single_game_fails():
    one_game = [
        _row("1", "QB A", "QB", "ATL", 5000, GI_A),
        _row("2", "RB A", "RB", "ATL", 5000, GI_A),
        _row("3", "RB B", "RB", "NO", 5000, GI_A),
        _row("4", "WR A", "WR", "ATL", 5000, GI_A),
        _row("5", "WR B", "WR", "NO", 5000, GI_A),
        _row("6", "WR C", "WR", "NO", 5000, GI_A),
        _row("7", "TE A", "TE", "ATL", 5000, GI_A),
        _row("8", "RB C", "RB", "NO", 5000, GI_A),
        _row("9", "Saints", "DST", "NO", 3000, GI_A),
    ]
    ids = ["1", "2", "3", "4", "5", "6", "7", "8", "9"]
    problems = V.validate_lineup(_lineup(ids), V.slate_index(one_game))
    assert any("1 game" in p for p in problems)


def test_wrong_roster_size(slate):
    problems = V.validate_lineup(_lineup(LEGAL[:8], slots=["QB"] * 8), V.slate_index(slate))
    assert any("8 players" in p for p in problems)


def test_assert_valid_names_lineup_and_rule(slate):
    bad = _lineup(["1", "2", "12", "4", "5", "10", "7", "8", "9"])
    with pytest.raises(RuntimeError, match=r"lineup 2.*50000"):
        V.assert_valid([_lineup(LEGAL), bad], slate)


def test_assert_valid_passes_silently(slate):
    V.assert_valid([_lineup(LEGAL), _lineup(LEGAL, 46500)], slate)


# ------------------------------------------------------------------ showdown

GI_SD = "SEA@NE 10/06/2026 08:15PM ET"


def _sd_row(dk, name, team, salary, rp, pid):
    return _row(dk, name, "WR", team, salary, GI_SD, pid=pid, rp=rp)


@pytest.fixture
def sd_slate() -> list[dict]:
    rows = []
    people = [("jsn", "SEA", 8000), ("maye", "NE", 7000), ("ajb", "NE", 6000),
              ("darnold", "SEA", 5000), ("stev", "NE", 4000), ("seadst", "SEA", 3000)]
    for k, (pid, team, sal) in enumerate(people):
        rows.append(_sd_row(f"c{k}", pid, team, int(sal * 1.5), "CPT", pid))
        rows.append(_sd_row(f"f{k}", pid, team, sal, "FLEX", pid))
    return rows


SD_SLOTS = ["CPT", "FLEX", "FLEX2", "FLEX3", "FLEX4", "FLEX5"]


def test_showdown_legal(sd_slate):
    lu = _lineup(["c0", "f1", "f2", "f3", "f4", "f5"], 37000, slots=SD_SLOTS)
    assert V.validate_lineup(lu, V.slate_index(sd_slate), "showdown") == []


def test_showdown_cpt_slot_must_be_cpt_row(sd_slate):
    lu = _lineup(["f0", "f1", "f2", "f3", "f4", "f5"], slots=SD_SLOTS)
    problems = V.validate_lineup(lu, V.slate_index(sd_slate), "showdown")
    assert any("CPT" in p for p in problems)


def test_showdown_same_person_twice(sd_slate):
    lu = _lineup(["c0", "f0", "f2", "f3", "f4", "f5"], slots=SD_SLOTS)
    problems = V.validate_lineup(lu, V.slate_index(sd_slate), "showdown")
    assert any("duplicate" in p.lower() for p in problems)


def test_showdown_both_teams(sd_slate):
    extra = [_sd_row("f9", "x", "SEA", 3000, "FLEX", "x"), _sd_row("f8", "y", "SEA", 3000, "FLEX", "y")]
    lu = _lineup(["c0", "f3", "f5", "f9", "f8", "f1"], slots=SD_SLOTS)
    assert V.validate_lineup(lu, V.slate_index(sd_slate + extra), "showdown") == []
    lu = _lineup(["c0", "f3", "f5", "f9", "f8", "f0"], slots=SD_SLOTS)
    problems = V.validate_lineup(lu, V.slate_index(sd_slate + extra), "showdown")
    assert any("team" in p.lower() for p in problems)


def test_showdown_cap_uses_cpt_salary(sd_slate):
    # CPT jsn 12000 + flex 7000+6000+5000+4000 = 34000 legal; bump flex rows to break it
    pricey = [_sd_row(f"p{k}", f"p{k}", "NE", 9000, "FLEX", f"p{k}") for k in range(4)]
    lu = _lineup(["c0", "p0", "p1", "p2", "p3", "f5"], slots=SD_SLOTS)  # 12000+36000+3000 = 51000
    problems = V.validate_lineup(lu, V.slate_index(sd_slate + pricey), "showdown")
    assert any("51000" in p for p in problems)


# ------------------------------------------------------------------ upload file parsing

def test_parse_upload_file(tmp_path):
    p = tmp_path / "dk_upload_2026_06_main_abcd1234_sim.csv"
    p.write_text("QB,RB,RB,WR,WR,WR,TE,FLEX,DST\nQB A (1),RB A (2),RB B (3),WR A (4),WR B (5),WR C (6),TE A (7),RB C (8),Cowboys (9)\n")
    lus = V.read_upload(p)
    assert len(lus) == 1
    assert lus[0]["dk_ids"] == LEGAL
    assert lus[0]["slots"][0] == "QB" and lus[0]["slots"][-1] == "DST"
    assert lus[0]["salary_used"] is None
