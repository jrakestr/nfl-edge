"""Standalone cross-week classic optimizer: DK rules, diversity, stack, fail-closed pool."""
from __future__ import annotations

import pytest

from nfl_edge.dfs import cross_slate as cs

PAIR_A = ("ATL", "NO")
PAIR_B = ("TB", "DAL")


def _team_players(team: str, opp: str, pair: tuple[str, str], base: float) -> list[dict]:
    rows = []

    def add(pos, n, sal0, fp0):
        for k in range(n):
            pid = f"{team}_{pos}{k}"
            rows.append({
                "player_id": pid, "dk_id": f"{team}{pos}{k}", "name": f"{team} {pos}{k}",
                "team": team, "opp": opp, "pos": pos, "game": pair,
                "salary": sal0 - 600 * k, "mean": base * (fp0 - 2.0 * k),
                "p90": base * (fp0 - 2.0 * k) * 1.6, "run_id": "r",
            })

    add("QB", 1, 6500, 20.0)
    add("RB", 3, 6000, 14.0)
    add("WR", 4, 6500, 15.0)
    add("TE", 2, 4500, 10.0)
    add("DST", 1, 3000, 7.0)
    return rows


@pytest.fixture
def pool() -> list[dict]:
    rows = []
    for (away, home), base in ((PAIR_A, 1.0), (PAIR_B, 0.9)):
        rows += _team_players(away, home, (away, home), base)
        rows += _team_players(home, away, (away, home), base * 0.95)
    return rows


def _check_lineup(lu: dict, pool_by_id: dict, cap: int = 50_000) -> None:
    ids = lu["player_ids"]
    assert len(ids) == 9 and len(set(ids)) == 9
    ps = [pool_by_id[i] for i in ids]
    pos = [p["pos"] for p in ps]
    assert pos.count("QB") == 1 and pos.count("DST") == 1
    assert 2 <= pos.count("RB") <= 3 and 3 <= pos.count("WR") <= 4 and 1 <= pos.count("TE") <= 2
    assert sum(p["salary"] for p in ps) <= cap
    assert len({p["game"] for p in ps}) >= 2


def test_lineups_are_valid_dk_classic(pool):
    by_id = {p["player_id"]: p for p in pool}
    lus = cs.optimize(pool, 6, jitter=0.0)
    assert len(lus) == 6
    for lu in lus:
        _check_lineup(lu, by_id)
    scores = [lu["proj_fpts"] for lu in lus]
    assert scores == sorted(scores, reverse=True)


def test_min_diff_between_every_pair(pool):
    lus = cs.optimize(pool, 8, min_diff=3, jitter=0.0, max_exposure=1.0)
    for i, a in enumerate(lus):
        for b in lus[i + 1:]:
            assert len(set(a["player_ids"]) ^ set(b["player_ids"])) // 2 >= 3


def test_exposure_cap(pool):
    n = 10
    lus = cs.optimize(pool, n, max_exposure=0.4, jitter=0.0, min_diff=1)
    counts: dict[str, int] = {}
    for lu in lus:
        for pid in lu["player_ids"]:
            counts[pid] = counts.get(pid, 0) + 1
    assert max(counts.values()) <= int(0.4 * n)


def test_qb_stack_and_bringback(pool):
    by_id = {p["player_id"]: p for p in pool}
    for lu in cs.optimize(pool, 6, jitter=0.0, max_exposure=1.0):
        ps = [by_id[i] for i in lu["player_ids"]]
        qb = next(p for p in ps if p["pos"] == "QB")
        assert any(p["team"] == qb["team"] and p["pos"] in ("WR", "TE") for p in ps)
        assert any(p["team"] == qb["opp"] and p["pos"] in ("WR", "TE", "RB") for p in ps)


def test_seeded_jitter_is_reproducible(pool):
    a = cs.optimize(pool, 4, jitter=0.1, seed=3, max_exposure=1.0)
    b = cs.optimize(pool, 4, jitter=0.1, seed=3, max_exposure=1.0)
    assert [x["player_ids"] for x in a] == [x["player_ids"] for x in b]


def test_cannot_reach_requested_count_raises(pool):
    with pytest.raises(RuntimeError, match="built"):
        cs.optimize(pool, 10, max_exposure=0.1, jitter=0.0)


def test_empty_pool_raises():
    with pytest.raises(RuntimeError):
        cs.optimize([], 3)


# ------------------------------------------------------------------ pool builder

def _salary(pid, name, pos, team, game_info, sal=5000, dk="1"):
    return {"player_id": pid, "name": name, "position": pos, "team": team,
            "salary": sal, "game_info": game_info, "player_dk_id": dk}


def _proj(pid, mean=10.0, p90=18.0):
    return {"player_id": pid, "fpts_dk_mean": mean, "p90": p90, "run_id": "r"}


def test_build_pool_routes_by_game():
    sal = [
        _salary("a", "A", "WR", "ATL", "ATL@NO 10/05/2026 08:15PM ET", dk="1"),
        _salary("t", "T", "WR", "TB", "TB@DAL 10/08/2026 08:15PM ET", dk="2"),
    ]
    proj = {PAIR_A: {"a": _proj("a", 11.0)}, PAIR_B: {"t": _proj("t", 12.0)}}
    out = cs.build_pool(sal, proj, {})
    by = {p["player_id"]: p for p in out.players}
    assert by["a"]["mean"] == 11.0 and by["t"]["mean"] == 12.0
    assert by["a"]["opp"] == "NO" and by["t"]["opp"] == "DAL"
    assert by["a"]["game"] == PAIR_A


def test_build_pool_missing_game_raises_naming_pair():
    sal = [_salary("t", "T", "WR", "TB", "TB@DAL 10/08/2026 08:15PM ET")]
    with pytest.raises(RuntimeError, match="TB@DAL"):
        cs.build_pool(sal, {PAIR_A: {}}, {})


def test_build_pool_drops_out_and_lists_it():
    sal = [
        _salary("a", "A", "WR", "ATL", "ATL@NO 10/05/2026 08:15PM ET", dk="1"),
        _salary("b", "B", "WR", "ATL", "ATL@NO 10/05/2026 08:15PM ET", dk="2"),
    ]
    proj = {PAIR_A: {"a": _proj("a"), "b": _proj("b")}}
    out = cs.build_pool(sal, proj, {PAIR_A: {"b": "Out"}})
    assert [p["player_id"] for p in out.players] == ["a"]
    assert [d["player_id"] for d in out.dropped] == ["b"]


def test_build_pool_unmatched_and_unprojected_listed_not_guessed():
    sal = [
        _salary(None, "Nobody", "WR", "ATL", "ATL@NO 10/05/2026 08:15PM ET", dk="1"),
        _salary("c", "C", "WR", "ATL", "ATL@NO 10/05/2026 08:15PM ET", dk="2"),
        _salary("a", "A", "WR", "ATL", "ATL@NO 10/05/2026 08:15PM ET", dk="3"),
    ]
    out = cs.build_pool(sal, {PAIR_A: {"a": _proj("a")}}, {})
    assert [p["player_id"] for p in out.players] == ["a"]
    assert [u["name"] for u in out.unmatched] == ["Nobody"]
    assert [u["name"] for u in out.unprojected] == ["C"]


def test_build_pool_duplicate_player_id_raises():
    gi = "ATL@NO 10/05/2026 08:15PM ET"
    sal = [_salary("a", "A", "WR", "ATL", gi, dk="1"), _salary("a", "A", "WR", "ATL", gi, dk="2")]
    with pytest.raises(RuntimeError, match="twice"):
        cs.build_pool(sal, {PAIR_A: {"a": _proj("a")}}, {})


# ------------------------------------------------------------------ upload

def test_upload_csv_header_and_ids(pool):
    lus = cs.optimize(pool, 2, jitter=0.0)
    text = cs.upload_csv(lus)
    lines = text.strip().split("\n")
    assert lines[0] == "QB,RB,RB,WR,WR,WR,TE,FLEX,DST"
    assert len(lines) == 3
    assert all(c.endswith(")") for c in lines[1].split(","))
    assert lus[0]["slots"][0] == "QB" and lus[0]["slots"][-1] == "DST"
    assert sorted(lus[0]["slots"][1:3]) == ["RB", "RB"]
    assert lus[0]["slots"][3:6] == ["WR", "WR", "WR"] and lus[0]["slots"][6] == "TE"
