import datetime as dt

import polars as pl
import pytest

from nfl_edge.ingest import consensus, context, opportunity


def _schedules():
    # 2024 week 12 (Sun 11-24), week 13 (Thu 11-28 Thanksgiving, Sun 12-01), 2025 week 1 (Thu 09-04)
    return pl.DataFrame(
        {
            "season": [2024, 2024, 2024, 2025],
            "week": [12, 13, 13, 1],
            "gameday": ["2024-11-24", "2024-11-28", "2024-12-01", "2025-09-04"],
        }
    )


def test_map_scrape_dates_to_next_gameday_week():
    cal = consensus.week_calendar(_schedules())
    m = consensus.map_scrape_dates(
        pl.Series(["2024-11-22", "2024-11-27", "2024-11-29", "2025-03-01", "2025-09-03"]), cal
    ).sort("scrape_date")
    rows = {r["scrape_date"].isoformat(): (r["season"], r["week"]) for r in m.iter_rows(named=True)}
    assert rows["2024-11-22"] == (2024, 12)
    assert rows["2024-11-27"] == (2024, 13)   # Wednesday before Thanksgiving games
    assert rows["2024-11-29"] == (2024, 13)   # Friday before Sunday of the same week
    assert rows["2025-09-03"] == (2025, 1)
    assert "2025-03-01" not in rows           # offseason scrape: next game is months away


def test_build_keeps_latest_scrape_per_week_and_dedupes_players():
    rankings = pl.DataFrame(
        {
            "scrape_date": ["2024-11-27", "2024-11-27", "2024-11-29", "2024-11-29", "2024-11-29"],
            "page_type": ["weekly-rb", "weekly-rb", "weekly-rb", "weekly-rb", "weekly-idp"],
            "id": ["1", "2", "1", "1", "9"],
            "player": ["A", "B", "A", "A dup", "IDP"],
            "pos": ["RB"] * 5,
            "team": ["KC"] * 5,
            "ecr": [1.0, 2.0, 1.5, 3.0, 1.0],
            "sd": [0.1] * 5,
            "best": [1.0] * 5,
            "worst": [3.0] * 5,
        }
    )
    out = consensus.build(rankings, _schedules())
    assert out.columns == consensus.OUT_COLS
    assert out["page_type"].unique().to_list() == ["weekly-rb"]       # idp page excluded
    assert out["scrape_date"].unique().to_list() == [dt.date(2024, 11, 29)]  # latest scrape only
    assert out.height == 1 and out["player"][0] == "A"               # dup id keeps best ecr
    assert (out["season"][0], out["week"][0]) == (2024, 13)


def test_depth_charts_both_shapes_map_to_same_columns():
    old = pl.DataFrame(
        {"season": [2024], "week": [1], "club_code": ["KC"], "gsis_id": ["00-1"], "position": ["QB"],
         "depth_position": ["QB"], "depth_team": ["1"], "full_name": ["P M"],
         "game_type": ["REG"], "formation": ["Offense"]}
    )
    new = pl.DataFrame(
        {"dt": ["2025-09-05T10:00:00Z"], "team": ["KC"], "player_name": ["P M"], "espn_id": ["1"],
         "gsis_id": ["00-1"], "pos_grp_id": [1], "pos_grp": ["Offense"], "pos_id": [1],
         "pos_name": ["Quarterback"], "pos_abb": ["QB"], "pos_slot": [9], "pos_rank": [1]}
    )
    a = context.build_depth_charts(old, 2024)
    b = context.build_depth_charts(new, 2025)
    assert a.columns == b.columns == context.DEPTH_COLS
    assert a["depth_team"][0] == 1 and b["depth_team"][0] == 1
    assert b["week"][0] is None and b["season"][0] == 2025
    assert b["dt"][0].year == 2025 and a["dt"][0] is None
    with pytest.raises(KeyError):
        context.build_depth_charts(pl.DataFrame({"x": [1]}), 2025)


def test_opportunity_build_drops_team_residual_rows():
    df = pl.DataFrame(
        {"season": ["2024", "2024"], "week": [1.0, 1.0], "player_id": ["00-1", None],
         "full_name": ["A", None], "position": ["WR", None], "posteam": ["KC", "KC"],
         "rec_attempt": [5.0, 1.0], "rec_touchdown_exp": [0.4, float("nan")]}
    )
    out = opportunity.build(df)
    assert out.height == 1 and out["season"].dtype == pl.Int32 and out["week"][0] == 1
    assert out["stats"][0]["rec_attempt"] == 5.0
