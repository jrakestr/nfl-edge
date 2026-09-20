"""Construction profiles: one JSON both pipelines read. No database."""
from __future__ import annotations

import json

import numpy as np
import pytest

from nfl_edge.config import CONFIG_DIR
from nfl_edge.dfs import construction as C
from nfl_edge.sim import slate


def test_json_is_the_source_for_classic_and_showdown():
    raw = json.loads((CONFIG_DIR / "dfs" / "constructions.json").read_text())
    assert set(raw) == {"classic", "showdown"}
    for kind in raw.values():
        assert set(kind) == {"cash", "single", "mass"}
        for row in kind.values():
            assert "floor_percentile" in row
            assert "ceiling_weight" in row
            assert "ownership_penalty" in row
            assert row["objective"] in {"floor", "mean_ceiling_own", "jittered_mean"}


def test_cash_classic_is_floor_full_cap_no_stack():
    p = C.profile("classic", "cash")
    assert p["objective"] == "floor"
    assert p["floor_percentile"] == 25
    assert p["randomness"] == 0
    assert p["min_lineup_salary"] == 49700
    assert p["lineups"] == 1
    assert p["lineups_max"] == 3
    assert p["max_exposure"] == 100
    assert p["num_uniques"] == 1
    assert p["stack_n"] == 0
    assert p["bring_back"] == 0
    assert p["ceiling_weight"] == 0
    assert p["ownership_penalty"] == 0


def test_single_classic_is_mean_ceiling_own_with_qb_stack():
    p = C.profile("classic", "single")
    assert p["objective"] == "mean_ceiling_own"
    assert p["ceiling_weight"] > 0
    assert p["ownership_penalty"] > 0
    assert p["randomness"] == 0
    assert p["min_lineup_salary"] == 49200
    assert p["lineups"] == 1
    assert p["lineups_max"] == 5
    assert p["min_player_diff"] == 2
    assert p["stack_n"] == 1
    assert p["bring_back"] == 1
    assert p["max_exposure"] == 100
    assert p["num_uniques"] is None


def test_mass_classic_matches_today():
    p = C.profile("classic", "mass")
    assert p["objective"] == "jittered_mean"
    assert p["randomness"] == 25
    assert p["max_exposure"] == 40
    assert p["num_uniques"] == 3
    assert p["min_lineup_salary"] == 49200
    assert p["lineups"] == 150
    assert p["stack_n"] == 2
    assert p["bring_back"] == 1


def test_unknown_construction_fails_closed():
    with pytest.raises(ValueError, match="construction"):
        C.profile("classic", "gpp")


def test_adjusted_fpts_uses_named_weights():
    p = C.profile("classic", "single")
    # mean 10, p90 14, own 0.20 → 10 + w*4 − pen*0.20
    got = C.adjusted_fpts(10, p25=8, p90=14, own=0.20, profile=p)
    expect = 10 + p["ceiling_weight"] * 4 - p["ownership_penalty"] * 0.20
    assert got == pytest.approx(expect)
    cash = C.profile("classic", "cash")
    assert C.adjusted_fpts(10, p25=8, p90=14, own=0.9, profile=cash) == 8
    mass = C.profile("classic", "mass")
    assert C.adjusted_fpts(10, p25=8, p90=14, own=0.9, profile=mass) == 10


def test_apply_profile_writes_tools_knobs_not_a_new_objective():
    base = {
        "randomness": 25,
        "max_exposure": 40,
        "num_uniques": 3,
        "min_lineup_salary": 49200,
        "stack_rules": {"pair": [{"key": "QB"}], "limit": []},
    }
    cash = C.apply_to_tools_config(base, C.profile("classic", "cash"))
    assert cash["randomness"] == 0
    assert cash["min_lineup_salary"] == 49700
    assert cash["num_uniques"] == 1
    assert cash["stack_rules"]["pair"] == []
    assert "objective" not in cash
    single = C.apply_to_tools_config(base, C.profile("classic", "single"))
    assert single["num_uniques"] == 2
    assert single["stack_rules"]["pair"]
    sd = C.apply_to_tools_config(
        {"stack_rules": {"pair": []}, "randomness": 25, "max_exposure": 40,
         "num_uniques": 3, "min_lineup_salary": 0},
        C.profile("showdown", "single"),
        showdown=True,
    )
    assert sd["stack_rules"]["pair"] == []
    assert sd["num_uniques"] == 2


def test_lineup_count_uses_profile_and_rejects_over_max():
    assert C.lineup_count(C.profile("classic", "mass"), None) == 150
    assert C.lineup_count(C.profile("classic", "cash"), None) == 1
    with pytest.raises(ValueError, match="max"):
        C.lineup_count(C.profile("classic", "cash"), 150)


def test_summarize_includes_p25():
    arr = np.arange(1, 101, dtype=float)
    s = slate._summarize("fpts_ppr", arr)
    assert s["p10"] == pytest.approx(np.percentile(arr, 10))
    assert s["p25"] == pytest.approx(np.percentile(arr, 25))
    assert s["p90"] == pytest.approx(np.percentile(arr, 90))
