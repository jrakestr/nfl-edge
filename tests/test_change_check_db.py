"""change_check.run against a migrated database (pytest -m db). Seeds and removes season 1901.

fantasy.loc_status_snapshots is append-only, so ESPN rows are covered by the unit tests only.
"""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from nfl_edge import change_check as CC

pytestmark = pytest.mark.db
S, W = 1901, 3
T = datetime(1901, 9, 20, 12, tzinfo=UTC)


@pytest.fixture
def seeded():
    from nfl_edge.db import execute

    def clean():
        execute("delete from ops.change_checks where season = %s", (S,))
        execute("delete from model.sim_runs where season = %s", (S,))
        execute("delete from raw.player_overrides where season = %s", (S,))
        execute("delete from raw.schedules where game_id = %s", ("1901_03_A_B",))

    clean()
    execute("insert into raw.schedules (game_id, season, week, game_type, away_team, home_team) "
            "values ('1901_03_A_B', %s, %s, 'REG', 'A', 'B')", (S, W))
    execute("insert into model.sim_runs (run_id, season, week, draws_per_game, created_at) "
            "values ('00000000-0000-0000-0000-000000001901', %s, %s, 10, %s)", (S, W, T))
    execute("insert into model.proj_games (run_id, game_id, market_spread, market_total) "
            "values ('00000000-0000-0000-0000-000000001901', '1901_03_A_B', -3, 44)")
    execute("insert into raw.player_overrides (season, week, player_id, status, note, updated_at) "
            "values (%s, %s, 'X1', 'out', 'dk main O', %s), (%s, %s, 'X2', 'out', 'manual', %s)",
            (S, W, T + timedelta(hours=2), S, W, T - timedelta(hours=2)))
    yield
    clean()


def test_change_check_writes_a_row(seeded):
    from nfl_edge.db import read_sql

    r = CC.run(S, W)
    assert r["suggest_resim"] is True
    assert {(x["player"], x["source"]) for x in r["reasons"]} == {("X1", "dk")}
    row = read_sql("select suggest_resim, jsonb_array_length(reasons) as n, sim_run_id::text "
                   "from ops.change_checks where season = %s", (S,)).to_dicts()
    assert row == [{"suggest_resim": True, "n": 1,
                    "sim_run_id": "00000000-0000-0000-0000-000000001901"}]
