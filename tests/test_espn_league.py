from datetime import UTC, datetime
from types import SimpleNamespace as NS

import polars as pl
import pytest

from nfl_edge.config import espn_credentials
from nfl_edge.ingest import espn_league as E

NOW = datetime(2026, 10, 5, tzinfo=UTC)


def team(tid, name):
    return NS(team_id=tid, team_name=name)


def player(name, slot, proj, pts, opp="LAR"):
    return NS(name=name, position="RB", proTeam="PHI", pro_opponent=opp, slot_position=slot,
              projected_points=proj, points=pts, injuryStatus="ACTIVE")


def box(home, away):
    return NS(home_team=home[0], home_score=home[1], home_projected=-1, home_lineup=home[2],
              away_team=away[0], away_score=away[1], away_projected=-1, away_lineup=away[2])


def test_credentials_missing_or_blank(monkeypatch):
    monkeypatch.delenv("ESPN_S2", raising=False)
    monkeypatch.setenv("ESPN_SWID", "{x}")
    with pytest.raises(RuntimeError, match="ESPN_S2 not set"):
        espn_credentials()
    monkeypatch.setenv("ESPN_S2", "abc")
    monkeypatch.setenv("ESPN_SWID", "")
    with pytest.raises(RuntimeError, match="ESPN_SWID not set"):
        espn_credentials()


def test_starters_projection_skips_bench_and_ir():
    lineup = [player("a", "RB", 10.0, 0), player("b", "RB/WR/TE", 5.5, 0),
              player("c", "BE", 99.0, 0), player("d", "IR", 50.0, 0)]
    assert E.starters_projection(lineup) == 15.5


def test_weekly_and_player_rows_both_sides_with_ids_and_names_stripped():
    h = (team(1, "Home Team "), 100.123, [player("p1", "RB", 10.004, 20.0),
                                           player("p2", "BE", 1.0, 0.0, opp="None")])
    a = (team(2, " Away"), 90.0, [player("p3", "QB", 8.0, 7.0)])
    weekly, players = E.weekly_and_player_rows([box(h, a)], 2026, 4, False, NOW)
    by = {r["team"]: r for r in weekly}
    assert by["Home Team"]["opp_team"] == "Away" and by["Away"]["opp_team"] == "Home Team"
    assert by["Home Team"]["espn_team_id"] == 1 and by["Home Team"]["opp_espn_team_id"] == 2
    assert by["Home Team"]["proj_pts"] == 10.0 and by["Home Team"]["actual_pts"] == 100.12
    assert by["Away"]["is_final"] is False
    bench = next(p for p in players if p["player"] == "p2")
    assert bench["slot"] == "BE" and bench["opponent"] is None and bench["espn_team_id"] == 1
    assert len(players) == 3


def test_box_with_bye_side_fails_closed():
    h = (team(1, "A"), 1.0, [])
    with pytest.raises(ValueError, match="bye"):
        E.weekly_and_player_rows([box(h, (0, 0, []))], 2026, 1, True, NOW)


def _txn(**kw):
    return {"id": "t1", "type": "WAIVER", "status": "EXECUTED", "teamId": 3, "scoringPeriodId": 2,
            "bidAmount": 7, "processDate": 1788850882373, "items": [], **kw}


NAMES = {1: "Added", 2: "Dropped", 3: "Lineup Guy"}


def test_waiver_failed_and_canceled_bids_keep_bid_and_group_key():
    items = [{"type": "ADD", "playerId": 1}, {"type": "DROP", "playerId": 2}]
    raw = [_txn(status="FAILED_INVALIDPLAYERSOURCE", items=items),
           _txn(id="t2", status="CANCELED", bidAmount=3, items=items[:1])]
    rows = E.raw_transaction_rows(raw, 2026, NAMES.get)
    assert [(r["group_key"], r["item_type"], r["status"], r["bid"]) for r in rows] == [
        ("t1", "ADD", "FAILED_INVALIDPLAYERSOURCE", 7), ("t1", "DROP", "FAILED_INVALIDPLAYERSOURCE", 7),
        ("t2", "ADD", "CANCELED", 3)]
    assert {r["txn_type"] for r in rows} == {"WAIVER"} and rows[0]["espn_ts"] is not None


def test_free_agent_has_no_bid_and_roster_keeps_only_drops():
    raw = [_txn(id="fa", type="FREEAGENT", bidAmount=0, items=[{"type": "ADD", "playerId": 1}]),
           _txn(id="r1", type="ROSTER", items=[{"type": "LINEUP", "playerId": 3}]),
           _txn(id="r2", type="ROSTER", items=[{"type": "LINEUP", "playerId": 3},
                                               {"type": "DROP", "playerId": 2}]),
           _txn(id="x", type="TRADE_PROPOSAL", items=[{"type": "TRADE", "playerId": 1}])]
    rows = E.raw_transaction_rows(raw, 2026, NAMES.get)
    assert [(r["group_key"], r["txn_type"], r["item_type"], r["bid"]) for r in rows] == [
        ("fa", "FREEAGENT", "ADD", None), ("r2", "FREEAGENT", "DROP", None)]
    assert rows[1]["note"] == "drop without add"


def test_transaction_without_status_fails_closed():
    with pytest.raises(ValueError, match="no status"):
        E.raw_transaction_rows([_txn(status=None)], 2026, NAMES.get)


def test_trade_rows_group_by_feed_timestamp_and_are_stable():
    t1, t2 = team(1, "A"), team(2, "B")
    p = NS(name="Star")
    act = NS(date=1790785361584, actions=[(t1, "TRADE_SENT", p, 0), (t2, "TRADE_RECEIVED", p, 0),
                                          (t2, "TRADE_SENT", 3, 0), (t1, "TRADE_RECEIVED", 3, 0)])
    rows = E.trade_rows([act], 2026, NAMES.get)
    assert {r["group_key"] for r in rows} == {"trade-1790785361584"}
    assert E.trade_groups(rows) == 1
    assert [(r["espn_team_id"], r["item_type"], r["player"]) for r in rows] == [
        (1, "TRADE_SENT", "Star"), (2, "TRADE_RECEIVED", "Star"),
        (2, "TRADE_SENT", "Lineup Guy"), (1, "TRADE_RECEIVED", "Lineup Guy")]
    assert E.trade_rows([act], 2026, NAMES.get) == rows


def test_trade_leg_without_team_fails_closed():
    act = NS(date=1, actions=[(None, "TRADE_SENT", NS(name="X"), 0)])
    with pytest.raises(ValueError, match="no team"):
        E.trade_rows([act], 2026, NAMES.get)


def test_draft_rows():
    pick = NS(team=team(5, "T"), playerName="Rookie", round_num=2, round_pick=3, bid_amount=0)
    (row,) = E.draft_rows([pick], 2026)
    assert (row["txn_type"], row["item_type"], row["group_key"], row["bid"], row["week"]) == (
        "DRAFT", "DRAFTED", "draft-r2-p3", None, 0)


def test_settings_row_orders_waiver_days_and_strips_name():
    s = NS(name="League ", team_count=12, reg_season_count=14, playoff_team_count=8,
           scoring_type="H2H_POINTS", tie_rule="SLOT_POINTS", acquisition_budget=1000,
           minimum_bid=1, acquisition_limit=-1.0, waiver_process_days=["SUNDAY", "MONDAY", "FRIDAY"],
           waiver_process_hour=11, trade_deadline=1795629600000, veto_votes_required=4,
           position_slot_counts={"QB": 1, "TQB": 0, "": 0, "BE": 6})
    row = E.settings_row(NS(settings=s), 2026, NOW)
    assert row["league_name"] == "League" and row["acquisition_limit"] == -1
    assert row["waiver_process_days"] == ["MONDAY", "FRIDAY", "SUNDAY"]
    assert row["roster_slots"] == {"QB": 1, "BE": 6}
    assert row["trade_deadline"] == datetime(2026, 11, 25, 11, 0, tzinfo=E.LOCAL_TZ).replace(tzinfo=None)
    assert E._frame("fantasy.loc_league_settings", [row]).height == 1


def test_scoring_rows_reject_unknown_stat():
    s = NS(scoring_format=[{"abbr": "Unknown", "label": "Unknown", "id": 999, "points": 1.0}])
    with pytest.raises(ValueError, match="999"):
        E.scoring_rows(NS(settings=s), 2026)


def test_team_rows_faab_and_owner():
    t = NS(team_id=4, team_name="Name ", team_abbrev="NM", acquisition_budget_spent=250,
           acquisitions=3, drops=2, trades=1,
           owners=[{"firstName": "Jamie ", "lastName": "Clark", "displayName": "jc"}])
    (row,) = E.team_rows(NS(settings=NS(acquisition_budget=1000), teams=[t]), 2026, NOW)
    assert (row["team"], row["owner"], row["faab_spent"], row["faab_remaining"]) == (
        "Name", "Jamie Clark", 250, 750)


def test_frame_dtypes_match_table_schema():
    df = E._frame("fantasy.loc_transactions", [E._item(2026, None, None, 1, "TRADE", "EXECUTED", None,
                                                       "TRADE_SENT", "P", "g")])
    assert df.schema["week"] == pl.Int64 and df.schema["bid"] == pl.Int64


WAIVER_MS = 1791356400000


def avail(pid=1, name="Add Me", status="WAIVERS", owned=12.5, bye=False, injury="QUESTIONABLE", ms=WAIVER_MS):
    return NS(playerId=pid, name=name, position="WR", proTeam="KC", injuryStatus=injury,
              percent_owned=owned, on_bye_week=bye, availability=status, waiver_process_ms=ms)


def test_available_rows_store_season_points_and_projection():
    p = avail()
    p.total_points = 48.126
    p.projected_total_points = 180.2
    (row,) = E.available_rows([p], 2026, 4, NOW)
    assert row["season_pts"] == 48.13
    assert row["season_proj"] == 180.2


def test_available_rows_leave_missing_season_numbers_null():
    (row,) = E.available_rows([avail()], 2026, 4, NOW)
    assert row["season_pts"] is None and row["season_proj"] is None


def test_available_rows_keep_waiver_status_and_utc_process_time():
    (row,) = E.available_rows([avail()], 2026, 4, NOW)
    assert row["availability"] == "WAIVERS"
    assert row["waiver_at"] == datetime.fromtimestamp(WAIVER_MS / 1000, UTC)
    assert row["percent_owned"] == 12.5 and row["on_bye"] is False
    assert row["week"] == 4 and row["pulled_at"] == NOW and row["espn_player_id"] == 1


def test_free_agent_has_no_process_time_and_drops_unknown_ownership():
    (row,) = E.available_rows([avail(status="FREEAGENT", owned=-1, ms=WAIVER_MS, bye=True, injury="")], 2026, 4, NOW)
    assert row["availability"] == "FREEAGENT"
    assert row["waiver_at"] is None and row["percent_owned"] is None
    assert row["on_bye"] is True and row["injury_status"] is None


def test_available_rows_reject_a_missing_status():
    p = avail()
    p.availability = None
    with pytest.raises(ValueError, match="no waiver or free-agent status"):
        E.available_rows([p], 2026, 4, NOW)


def test_available_rows_reject_a_repeated_player():
    with pytest.raises(ValueError, match="twice"):
        E.available_rows([avail(), avail()], 2026, 4, NOW)


def test_available_frame_matches_schema():
    df = E._frame("fantasy.loc_available", E.available_rows([avail()], 2026, 4, NOW))
    assert df.schema == pl.Schema(E.SCHEMAS["fantasy.loc_available"])
    assert E.KEYS["fantasy.loc_available"] == ["season", "espn_player_id"]


def test_tag_available_reads_the_pool_entry_status():
    box = NS(name="Add Me")
    tagged = E._tag_available(box, {"status": "WAIVERS", "waiverProcessDate": WAIVER_MS})
    assert tagged.availability == "WAIVERS" and tagged.waiver_process_ms == WAIVER_MS
    with pytest.raises(ValueError, match="no waiver or free-agent status"):
        E._tag_available(NS(name="Add Me"), {})
