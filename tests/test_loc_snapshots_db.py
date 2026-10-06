"""fantasy.loc_status_snapshots is append-only. Marked `db`; rolls back everything it inserts."""
from __future__ import annotations

import psycopg
import pytest

pytestmark = pytest.mark.db

INSERT = ("insert into fantasy.loc_status_snapshots "
          "(season, week, espn_team_id, player, pulled_at, slot, status) values "
          "(1999, 1, 1, 'Test Player', %s, 'WR', %s)")


@pytest.fixture
def cur():
    from nfl_edge.db import conn
    try:
        with conn() as c:
            cur = c.cursor()
            try:
                cur.execute("select 1 from fantasy.loc_status_snapshots limit 0")
            except psycopg.errors.UndefinedTable:
                pytest.skip("migration 0033 not applied")
            try:
                yield cur
            finally:
                c.rollback()  # `with conn()` would commit on exit; nothing here may persist
    except RuntimeError as e:
        pytest.skip(str(e))


def test_two_pulls_coexist_and_never_change(cur):
    cur.execute(INSERT, ("2026-10-08T14:00:00Z", "ACTIVE"))
    cur.execute(INSERT, ("2026-10-08T14:01:00Z", "QUESTIONABLE"))
    cur.execute("select pulled_at, status from fantasy.loc_status_snapshots "
                "where season = 1999 order by pulled_at")
    assert [r[1] for r in cur.fetchall()] == ["ACTIVE", "QUESTIONABLE"]


def test_update_delete_truncate_raise(cur):
    cur.execute(INSERT, ("2026-10-08T14:00:00Z", "ACTIVE"))
    for sql in ("update fantasy.loc_status_snapshots set status = 'OUT' where season = 1999",
                "delete from fantasy.loc_status_snapshots where season = 1999",
                "truncate fantasy.loc_status_snapshots"):
        cur.execute("savepoint s")
        with pytest.raises(psycopg.errors.RaiseException, match="append-only"):
            cur.execute(sql)
        cur.execute("rollback to savepoint s")


def test_reusing_a_stamp_for_the_same_player_is_rejected(cur):
    cur.execute(INSERT, ("2026-10-08T14:00:00Z", "ACTIVE"))
    with pytest.raises(psycopg.errors.UniqueViolation):
        cur.execute(INSERT, ("2026-10-08T14:00:00Z", "OUT"))
