"""Research Lab fields: as-of rule, last-3 form, no imputation, fail closed. No database."""
import polars as pl
import pytest

from nfl_edge.config import load_yaml
from nfl_edge.research import fields as F

RULES = load_yaml("scoring.yaml")
S, W = 2026, 4


def _stats(rows):
    cols = {"season": [], "week": [], "player_id": [], "targets": [], "receptions": [], "rec_yds": [],
            "carries": [], "rush_yds": []}
    for r in rows:
        for k, vals in cols.items():
            vals.append(r.get(k, 0))
    zeros = [0.0] * len(cols["week"])
    return pl.DataFrame({**cols, "rec_td": zeros, "rush_td": zeros, "pass_yds": zeros, "pass_td": zeros,
                         "int_": zeros, "fum_lost": zeros, "two_pt": zeros}).with_columns(
        pl.col("targets", "receptions", "rec_yds", "carries", "rush_yds").cast(pl.Float64))


USAGE = pl.DataFrame({
    "player_id": ["A", "B"], "full_name": ["Ann", "Bob"], "team": ["DET", "DET"], "position": ["WR", "RB"],
    "target_share": [0.3, 0.05], "carry_share": [0.0, 0.6], "rz_target_share": [0.2, 0.05],
    "rz_carry_share": [0.0, 0.5], "snap_pct": [0.9, 0.7],
})
SNAPS = pl.DataFrame({
    "season": [S, S, S], "week": [1, 2, 3], "player_id": ["A", "A", "A"], "offense_pct": [0.5, 0.8, 1.0],
})
STATS = _stats([
    {"season": S, "week": 1, "player_id": "A", "targets": 4, "receptions": 2, "rec_yds": 20},
    {"season": S, "week": 2, "player_id": "A", "targets": 8, "receptions": 6, "rec_yds": 80},
    {"season": S, "week": 3, "player_id": "A", "targets": 10, "receptions": 7, "rec_yds": 100},
    {"season": S - 1, "week": 17, "player_id": "A", "targets": 99, "receptions": 99, "rec_yds": 999},
])


def build(stats=STATS, snaps=SNAPS, usage=USAGE):
    return F.build_fields(stats, snaps, usage, S, W, RULES)


def row(df, pid):
    return df.filter(pl.col("player_id") == pid).row(0, named=True)["fields"]


def test_form_uses_this_season_last_three_games_only():
    a = row(build(), "A")
    assert a["games_played"] == 3
    assert a["targets_l3"] == pytest.approx((4 + 8 + 10) / 3)
    assert a["rec_yds_l3"] == pytest.approx((20 + 80 + 100) / 3)
    # prior-season game is excluded: season mean is over this season's 3 games
    assert a["dk_pts_season"] == pytest.approx((4 + 14 + 20) / 3)  # DK: 1/rec + 0.1/yd + 3 for 100 yds
    assert a["snap_pct_l3"] == pytest.approx((0.5 + 0.8 + 1.0) / 3)
    assert a["snap_pct_last"] == 1.0


def test_l3_drops_older_games():
    stats = _stats([{"season": S, "week": w, "player_id": "A", "targets": t}
                    for w, t in [(1, 100), (2, 2), (3, 4)]]
                   + [{"season": S, "week": 3, "player_id": "A", "targets": 6}])
    # duplicate week 3 row is just a fourth row in order; tail(3) -> weeks 2, 3, 3
    assert row(build(stats=stats), "A")["targets_l3"] == pytest.approx((2 + 4 + 6) / 3)


def test_usage_passes_through_and_missing_form_is_null_not_zero():
    b = row(build(), "B")
    assert b["target_share"] == 0.05 and b["snap_pct"] == 0.7
    assert b["games_played"] is None
    assert b["targets_l3"] is None and b["dk_pts_l3"] is None
    assert b["snap_pct_l3"] is None and b["snap_pct_last"] is None


def test_output_has_every_field_and_one_row_per_player():
    out = build()
    assert out.height == 2
    assert sorted(out["fields"].struct.fields) == sorted(F.FIELD_NAMES)
    assert out.select(pl.col("season").unique()).item() == S
    assert out.select(pl.col("week").unique()).item() == W


@pytest.mark.parametrize("bad", [(S, W), (S, W + 1), (S + 1, 1)])
def test_stats_at_or_after_target_week_raise(bad):
    leak = pl.concat([STATS, _stats([{"season": bad[0], "week": bad[1], "player_id": "A"}])])
    with pytest.raises(F.ResearchDataMissing, match="refusing to build"):
        build(stats=leak)


def test_snaps_at_target_week_raise():
    leak = pl.concat([SNAPS, pl.DataFrame({"season": [S], "week": [W], "player_id": ["A"], "offense_pct": [1.0]})])
    with pytest.raises(F.ResearchDataMissing, match="snap counts"):
        build(snaps=leak)


def test_no_usage_raises():
    with pytest.raises(F.ResearchDataMissing, match="no usage priors"):
        build(usage=USAGE.clear())


def test_no_games_this_season_raises():
    prior_only = _stats([{"season": S - 1, "week": 5, "player_id": "A"}])
    with pytest.raises(F.ResearchDataMissing, match="at least one game"):
        build(stats=prior_only)
