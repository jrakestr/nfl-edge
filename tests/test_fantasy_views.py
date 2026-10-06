"""fantasy.loc_team_week and fantasy.loc_starter_status_asof against an independent polars calculation.

Marked `db`; skips until migration 0034 is applied. The as-of test inserts snapshots inside a
transaction that is rolled back.
"""
from __future__ import annotations

from datetime import timedelta

import polars as pl
import pytest

pytestmark = pytest.mark.db

SEASON = 2026


@pytest.fixture(scope="module")
def weekly():
    from nfl_edge.db import read_sql
    try:
        df = read_sql("select season, week, espn_team_id, team, opp_espn_team_id, "
                      "proj_pts::float8 proj, actual_pts::float8 act, is_final "
                      "from fantasy.loc_weekly_scores where season = %s", (SEASON,))
        view = read_sql("select * from fantasy.loc_team_week where season = %s", (SEASON,))
    except Exception as e:  # noqa: BLE001 - missing DB or view: skip, do not fail the default run
        pytest.skip(f"fantasy views not available: {type(e).__name__}")
    if df.is_empty():
        pytest.skip("no loc_weekly_scores rows")
    return df, view


def expected(df: pl.DataFrame) -> pl.DataFrame:
    opp = df.select("week", pl.col("espn_team_id").alias("opp_espn_team_id"),
                    pl.col("proj").alias("opp_proj"), pl.col("act").alias("opp_act"))
    j = df.join(opp, on=["week", "opp_espn_team_id"]).sort("espn_team_id", "week")
    return j.with_columns(
        own_pm=pl.col("act") - pl.col("proj"),
        opp_pm=pl.col("opp_act") - pl.col("opp_proj"),
        proj_margin=pl.col("proj") - pl.col("opp_proj"),
        actual_margin=pl.col("act") - pl.col("opp_act"),
        win=pl.when(pl.col("act") > pl.col("opp_act")).then(1.0)
        .when(pl.col("act") == pl.col("opp_act")).then(0.5).otherwise(0.0),
        week_rank=pl.col("act").rank("min", descending=True).over("week"),
        league_avg=pl.col("act").mean().over("week"),
        league_sd=pl.col("act").std().over("week"),
        allplay_wins=pl.col("act").rank("min").over("week") - 1,
        allplay_losses=pl.col("act").rank("min", descending=True).over("week") - 1,
        cum_pf=pl.col("act").cum_sum().over("espn_team_id"),
        cum_pa=pl.col("opp_act").cum_sum().over("espn_team_id"),
    ).with_columns(
        swing=pl.col("actual_margin") - pl.col("proj_margin"),
        cum_pf_rank=pl.col("cum_pf").rank("min", descending=True).over("week"),
        pts_back_of_pf_leader=pl.col("cum_pf").max().over("week") - pl.col("cum_pf"),
        sd_from_avg=(pl.col("act") - pl.col("league_avg")) / pl.col("league_sd"),
    ).sort("espn_team_id", "week")


def test_team_week_matches_polars(weekly):
    df, view = weekly
    exp = expected(df)
    got = view.sort("espn_team_id", "week")
    assert got.height == exp.height == df.height
    for col in ("own_pm", "opp_pm", "proj_margin", "actual_margin", "swing", "win", "league_avg",
                "league_sd", "sd_from_avg", "cum_pf", "cum_pa", "pts_back_of_pf_leader"):
        assert got[col].cast(pl.Float64).to_list() == pytest.approx(exp[col].to_list(), abs=1e-6), col
    for col in ("week_rank", "allplay_wins", "allplay_losses", "cum_pf_rank"):
        assert got[col].cast(pl.Int64).to_list() == exp[col].cast(pl.Int64).to_list(), col


def test_team_week_symmetries(weekly):
    _, view = weekly
    v = view.with_columns(pl.col("swing").cast(pl.Float64), pl.col("win").cast(pl.Float64))
    # both sides of one game: swing is mirrored and wins add to 1
    pair = v.join(v.select("week", pl.col("espn_team_id").alias("opp_espn_team_id"),
                           pl.col("swing").alias("opp_swing"), pl.col("win").alias("opp_win")),
                  on=["week", "opp_espn_team_id"])
    assert (pair["swing"] + pair["opp_swing"]).abs().max() < 1e-6
    assert (pair["win"] + pair["opp_win"]).to_list() == [1.0] * pair.height
    # all-play: wins and losses never exceed the other teams that week
    assert ((v["allplay_wins"] + v["allplay_losses"]) <= 11).all()


def test_espn_nfl_team_codes_all_map_to_schedule_teams():
    from nfl_edge.db import read_sql
    try:
        codes = read_sql("select distinct nfl_team from fantasy.loc_player_week_scores "
                         "where season = %s and nfl_team is not null and nfl_team <> 'None'", (SEASON,))
        sched = read_sql("select home_team t from raw.schedules where season = %s "
                         "union select away_team from raw.schedules where season = %s",
                         (SEASON, SEASON))
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"no DB: {type(e).__name__}")
    mapped = {{"LAR": "LA", "WSH": "WAS"}.get(c, c) for c in codes["nfl_team"].to_list()}
    assert not mapped - set(sched["t"].to_list())


def test_asof_picks_newest_snapshot_before_kickoff_never_a_later_one():
    from nfl_edge.db import conn
    try:
        with conn() as c:
            cur = c.cursor()
            try:
                cur.execute("""select season, week, espn_team_id, player, kickoff
                                 from fantasy.loc_starter_status_asof
                                where season = %s and kickoff is not null
                                  and snapshot_pulled_at is null
                                order by week, player limit 1""", (SEASON,))
            except Exception as e:  # noqa: BLE001
                pytest.skip(f"fantasy views not available: {type(e).__name__}")
            row = cur.fetchone()
            if row is None:
                pytest.skip("no stored player-week with a kickoff and no snapshot")
            season, week, team, player, kickoff = row
            try:
                for i, (delta, status) in enumerate(((-26, "OLD"), (-3, "Q_BEFORE"), (-1, "OUT_NEWEST_BEFORE"),
                                                     (0, "AT_KICKOFF"), (2, "AFTER"))):
                    cur.execute("insert into fantasy.loc_status_snapshots "
                                "(season, week, espn_team_id, player, pulled_at, slot, status) "
                                "values (%s, %s, %s, %s, %s, 'WR', %s)",
                                (season, week, team, player,
                                 kickoff + timedelta(hours=delta, microseconds=i), status))
                cur.execute("""select snapshot_status, snapshot_pulled_at, kickoff
                                 from fantasy.loc_starter_status_asof
                                where season = %s and week = %s and espn_team_id = %s and player = %s""",
                            (season, week, team, player))
                status, pulled, ko = cur.fetchone()
                assert status == "OUT_NEWEST_BEFORE" and pulled < ko
            finally:
                c.rollback()  # `with conn()` would commit on exit; nothing here may persist
    except RuntimeError as e:
        pytest.skip(str(e))
