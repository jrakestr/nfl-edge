from datetime import UTC, datetime, timedelta
from types import SimpleNamespace as NS

import polars as pl
import pytest

from nfl_edge import db
from nfl_edge.ingest import espn_league as E

T0 = datetime(2026, 10, 8, 14, 0, tzinfo=UTC)


def rostered(name, slot, status, pos="WR", pro="LAR"):
    return NS(name=name, position=pos, proTeam=pro, lineupSlot=slot, injuryStatus=status,
              total_points=10.0, projected_total_points=12.0)


def league(current=5):
    teams = [NS(team_id=1, roster=[rostered("Starter", "WR", "ACTIVE"),
                                   rostered("Bench Q", "BE", "QUESTIONABLE", pro="WSH")]),
             NS(team_id=2, roster=[rostered("Hurt", "IR", "OUT")])]

    class L:
        current_week = current

        def __init__(self):
            self.teams = teams

        def box_scores(self, *_):
            raise AssertionError("snapshot-only must not fetch box scores")

        @property
        def draft(self):
            raise AssertionError("snapshot-only must not fetch the draft")

    return L()


def pool_player():
    return NS(playerId=9, name="Wire", position="RB", proTeam="KC", injuryStatus="ACTIVE",
              percent_owned=4.0, on_bye_week=False, availability="FREEAGENT", waiver_process_ms=None)


@pytest.fixture
def written(monkeypatch):
    calls = []
    replaces = []
    monkeypatch.setattr(db, "insert", lambda df, table: calls.append((table, df)) or df.height)
    monkeypatch.setattr(db, "replace_scope",
                        lambda df, table, where, params: replaces.append((table, df, where, params)) or df.height)
    monkeypatch.setattr(E, "fetch_available", lambda league, week: [pool_player()])
    for name in ("upsert", "replace_where"):
        monkeypatch.setattr(db, name, lambda *a, _n=name, **k: pytest.fail(f"{_n} must not be used"))
    return calls, replaces


def test_snapshot_rows_cover_every_rostered_player_with_one_stamp():
    rows = E.snapshot_rows(league(), 2026, 5, T0)
    assert {(r["espn_team_id"], r["player"], r["slot"], r["status"]) for r in rows} == {
        (1, "Starter", "WR", "ACTIVE"), (1, "Bench Q", "BE", "QUESTIONABLE"), (2, "Hurt", "IR", "OUT")}
    assert {r["pulled_at"] for r in rows} == {T0}
    assert {r["week"] for r in rows} == {5}
    assert next(r for r in rows if r["player"] == "Bench Q")["nfl_team"] == "WSH"


def test_snapshot_frame_matches_schema_and_key_includes_pulled_at():
    df = E._frame("fantasy.loc_status_snapshots", E.snapshot_rows(league(), 2026, 5, T0))
    assert df.schema == pl.Schema(E.SCHEMAS["fantasy.loc_status_snapshots"])
    assert "pulled_at" in E.KEYS["fantasy.loc_status_snapshots"]


def test_snapshot_only_appends_status_and_replaces_the_pool(written):
    inserts, replaces = written
    r = E.run_snapshot(2026, league=league(), now=T0)
    assert [t for t, _ in inserts] == ["fantasy.loc_status_snapshots"]
    df = inserts[0][1]
    assert df.height == 3 and df["week"].unique().to_list() == [5]
    assert df["pulled_at"].unique().to_list() == [T0]
    assert [t for t, _, _, _ in replaces] == ["fantasy.loc_available"]
    pool = replaces[0][1]
    assert pool.height == 1 and pool["availability"].to_list() == ["FREEAGENT"]
    assert replaces[0][2] == "season = %s" and replaces[0][3] == (2026,)
    assert r == {"season": 2026, "week": 5, "pulled_at": T0, "inserted": 3, "available": 1}


def test_two_runs_append_two_sets_with_distinct_stamps(written):
    inserts, replaces = written
    E.run_snapshot(2026, league=league(), now=T0)
    E.run_snapshot(2026, league=league(), now=T0 + timedelta(minutes=1))
    stamps = [df["pulled_at"][0] for _, df in inserts]
    assert len(inserts) == 2 and stamps[0] != stamps[1]
    assert len(replaces) == 2


def test_empty_roster_fails_closed(written):
    inserts, replaces = written
    lg = league()
    lg.teams = []
    with pytest.raises(ValueError, match="no rostered players"):
        E.run_snapshot(2026, league=lg, now=T0)
    assert inserts == [] and replaces == []


def test_empty_pool_writes_nothing(written, monkeypatch):
    inserts, replaces = written
    monkeypatch.setattr(E, "fetch_available", lambda league, week: [])
    with pytest.raises(ValueError, match="no available players"):
        E.run_snapshot(2026, league=league(), now=T0)
    assert inserts == [] and replaces == []
