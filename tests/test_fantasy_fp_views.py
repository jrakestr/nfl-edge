"""fantasy.loc_starter_fp_injury and fantasy.loc_player_week_check. Marked `db`; skips until migration
0036 is applied and the FantasyPros backfill exists. Inserts run in a transaction that is rolled back."""
from __future__ import annotations

import json
from datetime import UTC, timedelta

import polars as pl
import pytest

pytestmark = pytest.mark.db

SEASON = 2026


@pytest.fixture
def cur():
    from nfl_edge.db import conn
    try:
        with conn() as c:
            cur = c.cursor()
            try:
                cur.execute("select 1 from fantasy.loc_starter_fp_injury limit 0")
                cur.execute("select 1 from fantasy.loc_player_week_check limit 0")
            except Exception:  # noqa: BLE001
                c.rollback()
                pytest.skip("migration 0036 not applied")
            try:
                yield cur
            finally:
                c.rollback()  # `with conn()` would commit on exit; nothing here may persist
    except RuntimeError as e:
        pytest.skip(str(e))


def _matched_row(cur):
    cur.execute("""select season, week, espn_team_id, player, fp_id, kickoff
                     from fantasy.loc_starter_fp_injury
                    where season = %s and fp_matched and not ambiguous and kickoff is not null
                    order by week, player limit 1""", (SEASON,))
    row = cur.fetchone()
    if row is None:
        pytest.skip("no matched FantasyPros injury rows (backfill not run)")
    return row


def _insert_injury(cur, season, week, fp_id, name, fetched_at, payload):
    cur.execute("insert into raw.fantasypros_snapshots "
                "(endpoint, season, week, fetched_at, fp_id, name, team, position, payload) "
                "values ('injuries', %s, %s, %s, %s, %s, 'XXX', 'WR', %s)",
                (season, week, fetched_at, fp_id, name, json.dumps(payload)))


def test_name_key_ignores_case_punctuation_and_suffix(cur):
    cur.execute("select fantasy.loc_name_key(%s), fantasy.loc_name_key(%s), fantasy.loc_name_key(%s)",
                ("Kenneth Walker III", "D.J. Moore", "Marvin Harrison Jr."))
    assert cur.fetchone() == ("kennethwalker", "djmoore", "marvinharrison")


def test_newest_pull_wins_for_a_player(cur):
    season, week, team, player, fp_id, _ = _matched_row(cur)
    cur.execute("select max(fetched_at) from raw.fantasypros_snapshots "
                "where endpoint = 'injuries' and season = %s and week = %s", (season, week))
    newest = cur.fetchone()[0] + timedelta(hours=1)
    _insert_injury(cur, season, week, fp_id, player, newest,
                   {"status_short": "Q", "practice_3": "TESTNEW", "injury_update_date": None})
    cur.execute("select practice_3, fp_fetched_at from fantasy.loc_starter_fp_injury "
                "where season=%s and week=%s and espn_team_id=%s and player=%s",
                (season, week, team, player))
    p3, at = cur.fetchone()
    assert p3 == "TESTNEW" and at == newest


def test_known_before_kickoff_follows_the_update_date(cur):
    season, week, team, player, fp_id, kickoff = _matched_row(cur)
    cur.execute("select max(fetched_at) from raw.fantasypros_snapshots "
                "where endpoint = 'injuries' and season = %s and week = %s", (season, week))
    base = cur.fetchone()[0]
    for i, (delta, expect) in enumerate(((-2, True), (3, False), (0, True))):
        utc = (kickoff + timedelta(hours=delta)).astimezone(UTC).strftime("%Y-%m-%d %H:%M:%S")
        _insert_injury(cur, season, week, fp_id, player, base + timedelta(hours=1 + i),
                       {"status_short": "O", "injury_update_date": utc})
        cur.execute("select known_before_kickoff, injury_update_date <= kickoff "
                    "from fantasy.loc_starter_fp_injury "
                    "where season=%s and week=%s and espn_team_id=%s and player=%s",
                    (season, week, team, player))
        known, cmp = cur.fetchone()
        assert known is expect and cmp is expect
    _insert_injury(cur, season, week, fp_id, player, base + timedelta(hours=9),
                   {"status_short": "", "injury_update_date": None})
    cur.execute("select known_before_kickoff from fantasy.loc_starter_fp_injury "
                "where season=%s and week=%s and espn_team_id=%s and player=%s",
                (season, week, team, player))
    assert cur.fetchone()[0] is None


def test_unmatched_players_stay_with_no_match(cur):
    cur.execute("insert into fantasy.loc_player_week_scores "
                "(season, week, espn_team_id, player, position, nfl_team, slot, actual_pts) "
                "values (%s, 1, 1, 'Zzyzx Nomatchman', 'WR', 'KC', 'WR', 5.5)", (SEASON,))
    cur.execute("select fp_matched, fp_status from fantasy.loc_starter_fp_injury "
                "where season=%s and week=1 and player='Zzyzx Nomatchman'", (SEASON,))
    assert cur.fetchone() == (False, None)
    cur.execute("select no_match, fp_points, diff, comparable from fantasy.loc_player_week_check "
                "where season=%s and week=1 and player='Zzyzx Nomatchman'", (SEASON,))
    assert cur.fetchone() == (True, None, None, True)


def test_check_view_matches_a_polars_join_of_the_newest_points_rows(cur):
    cur.execute("""select p.season, p.week, p.espn_team_id, p.player, p.actual_pts::float8
                     from fantasy.loc_player_week_scores p where p.season = %s""", (SEASON,))
    espn = pl.DataFrame(cur.fetchall(), schema=["season", "week", "espn_team_id", "player", "act"],
                        orient="row")
    cur.execute("select season, week, espn_team_id, player, espn_actual, fp_points, no_match, ambiguous "
                "from fantasy.loc_player_week_check where season = %s", (SEASON,))
    view = pl.DataFrame(cur.fetchall(), schema=["season", "week", "espn_team_id", "player", "espn", "fp",
                                                "no_match", "ambiguous"], orient="row")
    if view.filter(~pl.col("no_match")).is_empty():
        pytest.skip("no FantasyPros points rows (backfill not run)")
    assert view.height == espn.height
    j = espn.join(view, on=["season", "week", "espn_team_id", "player"])
    assert (j["act"] - j["espn"]).abs().max() < 1e-6
    both = view.filter(~pl.col("no_match") & ~pl.col("ambiguous"))
    # matched starters track the PPR points closely (league scoring adds small bonuses)
    corr = both.select(pl.corr("espn", "fp")).item()
    assert corr > 0.9
