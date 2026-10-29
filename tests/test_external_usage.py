"""Spec for external usage shrinkage (priors/external_usage.py)."""
from __future__ import annotations

import polars as pl
import pytest

from nfl_edge.priors import external_usage as EU


def _history_rows() -> list[dict]:
    rows = []
    for w in (1, 2, 3, 4):
        for i in range(10):
            # Ours has MAE ~0.12 on carry share, FP has MAE ~0.06, NGS has MAE ~0.08
            rows.append({
                "week": w,
                "player_id": f"rb_{i}",
                "team": f"T{i % 2}",
                "position": "RB",
                "our_car_sh": 0.48,
                "act_car_sh": 0.60,
                "fp_car_sh": 0.54,
                "ngs_car_sh": 0.52,
                "our_tgt_sh": 0.12,
                "act_tgt_sh": 0.16,
                "fp_tgt_sh": 0.15,
                "ngs_tgt_sh": 0.14,
                "has_fp": True,
                "has_ngs": True,
            })
            rows.append({
                "week": w,
                "player_id": f"wr_{i}",
                "team": f"T{i % 2}",
                "position": "WR",
                "our_car_sh": 0.0,
                "act_car_sh": 0.0,
                "fp_car_sh": 0.0,
                "ngs_car_sh": 0.0,
                "our_tgt_sh": 0.20,
                "act_tgt_sh": 0.28,
                "fp_tgt_sh": 0.26,
                "ngs_tgt_sh": 0.24,
                "has_fp": True,
                "has_ngs": True,
            })
    return rows


def test_fit_weights_without_history_is_no_change():
    w = EU.fit_weights([])
    assert w["carry"]["alpha"] == 0.0
    assert w["carry"]["ours"] == 1.0
    assert w["target"]["alpha"] == 0.0
    assert w["target"]["ours"] == 1.0


def test_fit_weights_ranks_more_accurate_source_higher_and_caps_alpha():
    w = EU.fit_weights(_history_rows(), k_weeks=2.0, max_ext_weight=0.50)
    assert 0.0 < w["carry"]["alpha"] <= 0.50
    assert 0.0 < w["target"]["alpha"] <= 0.50
    assert w["carry"]["fantasypros"] > w["carry"]["nflgamesim"]
    assert w["target"]["fantasypros"] > w["target"]["nflgamesim"]
    assert w["carry"]["fantasypros"] + w["carry"]["nflgamesim"] == pytest.approx(1.0, abs=1e-3)


def test_apply_external_usage_preserves_invariants_and_zeroed_players():
    usage = pl.DataFrame({
        "team": ["DET"] * 5,
        "player_id": ["qb1", "rb1", "rb2", "wr1", "te1"],
        "position": ["QB", "RB", "RB", "WR", "TE"],
        "is_qb1": [True, False, False, False, False],
        "target_share": [0.0, 0.15, 0.0, 0.55, 0.30],
        "carry_share": [0.10, 0.60, 0.0, 0.30, 0.0],
        "rz_target_share": [0.0, 0.15, 0.0, 0.55, 0.30],
        "rz_carry_share": [0.10, 0.60, 0.0, 0.30, 0.0],
    })
    ext_week = pl.DataFrame({
        "source": ["fantasypros"] * 4 + ["nflgamesim"] * 4,
        "player_id": ["qb1", "rb1", "rb2", "wr1"] * 2,
        "rush_att": [3.0, 21.0, 8.0, 1.0, None, None, None, None],
        "rush_yds": [15.0, 95.0, 35.0, 5.0, 12.0, 110.0, 40.0, 0.0],
        "rec": [0.0, 5.0, 2.0, 8.0, None, None, None, None],
        "rec_yds": [0.0, 42.0, 14.0, 96.0, 0.0, 48.0, 10.0, 105.0],
    })
    weights = {
        "carry": {"ours": 0.50, "fantasypros": 0.60, "nflgamesim": 0.40, "alpha": 0.50},
        "target": {"ours": 0.50, "fantasypros": 0.60, "nflgamesim": 0.40, "alpha": 0.50},
    }
    out = EU.apply_external_usage(usage, ext_week, weights, ruled_out={"rb2"})
    # Every share column sums to 1.000
    for col in EU.SHARE_COLS:
        assert out[col].sum() == pytest.approx(1.0)
    by = {r["player_id"]: r for r in out.to_dicts()}
    # Ruled-out / zeroed rb2 stays strictly 0.0 even though external feeds project touches
    assert by["rb2"]["carry_share"] == 0.0
    assert by["rb2"]["target_share"] == 0.0
    # QB target shares remain strictly 0.0
    assert by["qb1"]["target_share"] == 0.0
    assert by["qb1"]["rz_target_share"] == 0.0
    # Lead back rb1 carry share increases toward the workhorse external projection
    assert by["rb1"]["carry_share"] > 0.60
