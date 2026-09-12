"""Spec for BettingPros Smart Money ingest into model.market_props. No database."""
from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import polars as pl
import pytest

from nfl_edge.market import bettingpros as B

FIXTURE = Path(__file__).parent / "fixtures" / "smart_money_sample.xlsx"
KNOWN = frozenset({
    "anytime_td", "int", "pass_td", "pass_yds", "rec", "rec_td", "rec_yds",
    "rush_td", "rush_yds",
})
ROSTER = pl.DataFrame({
    "gsis_id": ["00-0036259", "00-0036970", "00-0039150"],
    "full_name": ["Jauan Jennings", "Kyle Pitts", "Bryce Young"],
    "team": ["MIN", "ATL", "CAR"],
    "position": ["WR", "TE", "QB"],
})
CAPTURED = datetime(2026, 9, 12, tzinfo=UTC)


def test_resolve_xlsx_refuses_lock_file(tmp_path: Path):
    lock = tmp_path / "~$smart-money-week-1.xlsx"
    lock.write_bytes(b"lock")
    with pytest.raises(ValueError, match="lock"):
        B.resolve_xlsx(lock)


def test_resolve_xlsx_globs_out_lock_files(tmp_path: Path):
    (tmp_path / "~$smart-money-week-1.xlsx").write_bytes(b"lock")
    real = tmp_path / "smart-money-week-1.xlsx"
    real.write_bytes(b"xlsx")
    assert B.resolve_xlsx(tmp_path) == real


def test_resolve_xlsx_errors_when_two_workbooks(tmp_path: Path):
    (tmp_path / "a.xlsx").write_bytes(b"a")
    (tmp_path / "b.xlsx").write_bytes(b"b")
    with pytest.raises(ValueError, match="more than one"):
        B.resolve_xlsx(tmp_path)


def test_parse_slate_date():
    ts = B.parse_slate_date("Slate date: 09/12/2026 · 99 opportunities · $602K total liquidity · NFL")
    assert ts == CAPTURED


def test_parse_pick_over_under_half():
    assert B.parse_pick("Under 2.5") == ("under", 2.5)
    assert B.parse_pick("Over 39.5") == ("over", 39.5)
    assert B.parse_pick("CAR ML") is None
    assert B.parse_pick("CAR +3") is None


def test_load_sheet_reads_smart_money_picks_only():
    banner, df = B.load_sheet(FIXTURE)
    assert "09/12/2026" in banner
    assert "Selection" in df.columns
    assert "Consensus Odds" in df.columns
    names = set(df["Selection"].drop_nulls().to_list())
    assert "Jauan Jennings" in names
    assert "DO_NOT_READ" not in names
    assert "Betting Systems" not in "".join(map(str, df.columns))


def test_classify_skips_team_markets_and_unknown_stats():
    _banner, df = B.load_sheet(FIXTURE)
    out = B.classify(df, KNOWN)
    assert out["n_selection"] == 5
    assert out["n_team"] == 1
    assert out["n_player"] == 4
    assert out["n_mapped"] == 3
    markets = {r["market"]: r["n"] for r in out["rejected_markets"]}
    assert markets == {"Rush Atts": 1}
    sides = {(r["player"], r["stat"], r["side"], r["line"], r["over_odds"], r["under_odds"])
             for r in out["mapped"]}
    assert ("Jauan Jennings", "rec", "under", 2.5, None, -170) in sides
    assert ("Kyle Pitts Sr.", "rec_yds", "over", 39.5, -115, None) in sides


def test_classify_rejects_market_not_in_fair_props():
    df = pl.DataFrame({
        "Selection": ["A"], "Pos": ["QB"], "Team": ["CAR"], "Game": [None],
        "Market": ["Pass Atts"], "Pick": ["Over 30.5"], "Consensus Odds": [-115],
    })
    out = B.classify(df, KNOWN)
    assert out["n_mapped"] == 0
    assert out["rejected_markets"] == [{"market": "Pass Atts", "n": 1}]


def test_join_roster_requires_name_and_team():
    mapped = [
        {"player": "Jauan Jennings", "pos": "WR", "team": "MIN", "stat": "rec",
         "side": "under", "line": 2.5, "over_odds": None, "under_odds": -170},
        {"player": "Kyle Pitts Sr.", "pos": "TE", "team": "ATL", "stat": "rec_yds",
         "side": "over", "line": 39.5, "over_odds": -115, "under_odds": None},
        {"player": "Ghost Player", "pos": "WR", "team": "SF", "stat": "rec",
         "side": "under", "line": 1.5, "over_odds": None, "under_odds": -110},
        {"player": "Jauan Jennings", "pos": "WR", "team": "SF", "stat": "rec",
         "side": "under", "line": 2.5, "over_odds": None, "under_odds": -170},
    ]
    matched, rejected = B.join_roster(mapped, ROSTER)
    ids = {r["player_id"] for r in matched}
    assert ids == {"00-0036259", "00-0036970"}
    reasons = {(r["player"], r["pos"], r["team"], r["reason"]) for r in rejected}
    assert ("Ghost Player", "WR", "SF", "unmatched") in reasons
    assert ("Jauan Jennings", "WR", "SF", "unmatched") in reasons


def test_thin_table_does_not_persist(monkeypatch):
    calls = []
    monkeypatch.setattr(B, "persist", lambda *a, **k: calls.append(a) or 1)
    matched = [{"player_id": f"p{i}", "player_name": "X", "stat": "rec",
                "line": 1.5, "over_odds": None, "under_odds": -110}
               for i in range(59)]
    written = B.commit_if_enough(2026, 1, matched, [], CAPTURED)
    assert written == 0
    assert calls == []


def test_persist_replaces_source_slice(monkeypatch):
    calls = []

    def execute(sql, params=None):
        calls.append(("execute", sql, params))
        return 3

    def insert(df, table):
        calls.append(("insert", table, df.to_dicts()))
        return len(df)

    monkeypatch.setattr(B, "execute", execute)
    monkeypatch.setattr(B, "insert", insert)
    rows = [{
        "player_id": "00-0036259", "player_name": "Jauan Jennings",
        "stat": "rec", "line": 2.5, "over_odds": None, "under_odds": -170,
    }]
    n = B.persist(2026, 1, rows, CAPTURED)
    assert n == 1
    assert calls[0][0] == "execute"
    assert "delete from model.market_props" in calls[0][1]
    assert calls[0][2] == ("bettingpros", 2026, 1, CAPTURED)
    assert calls[1][0] == "insert"
    assert calls[1][1] == "model.market_props"
    written = calls[1][2][0]
    assert written["source"] == "bettingpros"
    assert written["season"] == 2026
    assert written["week"] == 1
    assert written["over_odds"] is None
    assert written["under_odds"] == -170
    assert written["captured_at"] == CAPTURED
