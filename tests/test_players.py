import datetime as dt

import polars as pl

from nfl_edge.ingest import players


def _players():
    return pl.DataFrame(
        {
            "gsis_id": ["00-0033873", "00-0000001", None],
            "display_name": ["Patrick Mahomes", "No Ff Match", "No Gsis"],
            "first_name": ["Patrick", "No", "No"],
            "last_name": ["Mahomes", "Match", "Gsis"],
            "position": ["QB", "WR", "RB"],
            "position_group": ["QB", "WR", "RB"],
            "latest_team": ["KC", "DAL", "NYG"],
            "status": ["ACT", "ACT", "RET"],
            "birth_date": ["1995-09-17", None, None],
            "rookie_season": [2017, 2020, 2010],
            "last_season": [2025, 2025, 2015],
            "pfr_id": ["MahoPa00", None, "XxxxYy00"],
            "espn_id": [3139477, None, None],
            "nfl_id": [None, None, None],
            "esb_id": [None, None, None],
            "pff_id": [None, None, None],
        }
    )


def _ff_ids():
    return pl.DataFrame(
        {
            "gsis_id": ["00-0033873", "00-0033873", None],
            "merge_name": ["patrick mahomes", "patrick mahomes", "orphan"],
            "sportradar_id": ["sr-1", "sr-1", "sr-x"],
            "fantasypros_id": [16393, 16393, 99],
            "fantasy_data_id": [18890, 18890, None],
            "sleeper_id": ["4046", "4046", None],
            "yahoo_id": [30123, 30123, None],
            "pfr_id": ["MahoPa00", "MahoPa00", None],
            "espn_id": [None, None, None],
        }
    )


def test_build_crosswalk_resolves_gsis_to_pfr_and_fp():
    out = players.build(_players(), _ff_ids())
    assert out.columns == players.OUT_COLS
    # rows without gsis_id are dropped; duplicates in ff_ids collapse
    assert out.height == 2
    row = out.filter(pl.col("gsis_id") == "00-0033873").row(0, named=True)
    assert row["pfr_id"] == "MahoPa00"
    assert row["fantasypros_id"] == "16393"
    assert row["espn_id"] == "3139477"
    assert row["merge_name"] == "patrick mahomes"
    assert row["birth_date"] == dt.date(1995, 9, 17)


def test_build_keeps_players_without_ff_match():
    out = players.build(_players(), _ff_ids())
    row = out.filter(pl.col("gsis_id") == "00-0000001").row(0, named=True)
    assert row["fantasypros_id"] is None
    assert row["pfr_id"] is None
    assert row["display_name"] == "No Ff Match"
