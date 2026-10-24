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


API_BODY = {
    "_parameters": {
        "sport": "NFL", "season": 2026, "week": "7",
        "include_markets": "true", "ev_threshold": "false",
    },
    "_pagination": {
        "page": 1, "limit": 50, "total_pages": 1, "total_items": 3,
        "paginated_array": "props", "self": "/v3/props",
    },
    "utc": "2026-10-23 18:04:00",
    "props": [
        {
            "market_id": 103,
            "participant": {
                "id": "15501", "name": "Jared Goff",
                "player": {"position": "QB", "team": "DET"},
            },
            "over": {"line": 274.5, "odds": 104, "consensus_line": 265.5, "consensus_odds": -112},
            "under": {"line": 266.5, "odds": -107, "consensus_line": 265.5, "consensus_odds": -115},
        },
        {
            "market_id": 104,
            "participant": {"id": "28168", "name": "Matt Hibner", "player": {"team": "DET"}},
            "over": {"consensus_line": 12.5, "consensus_odds": -110},
            "under": {"consensus_line": 12.5, "consensus_odds": -110},
        },
        {
            "market_id": 400,
            "participant": {"id": "15501", "name": "Jared Goff"},
            "over": {"consensus_line": 30.5, "consensus_odds": -115},
            "under": {"consensus_line": 30.5, "consensus_odds": -115},
        },
    ],
    "markets": [
        {
            "id": 103, "slug": "passing-yards", "period": "game", "category": "player-props",
            "stat": "", "meta": {"label": "Passing Yards", "short_label": "Pass Yds"},
        },
        {
            "id": 104, "slug": "receiving-yards", "period": "game", "category": "player-props",
            "stat": "", "meta": {"label": "Receiving Yards", "short_label": "Rec Yds"},
        },
        {
            "id": 400, "slug": "rushing-attempts", "period": "game", "category": "player-props",
            "stat": "", "meta": {"label": "Rushing Attempts", "short_label": "Rush Atts"},
        },
    ],
}
FP_PLAYERS = pl.DataFrame({
    "fantasypros_id": ["15501"],
    "gsis_id": ["00-0033106"],
})


def test_api_sends_key_and_maps_market_props(monkeypatch):
    import json

    monkeypatch.setenv("BETTING_PROS_API_KEY", "fake-bettingpros-key")
    monkeypatch.setenv("FANTASY_PROS_API_KEY", "fantasy-key-should-not-be-sent")
    captured = {}

    class Resp:
        status = 200

        def read(self):
            return json.dumps(API_BODY).encode()

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    def fake_urlopen(req, context=None, timeout=60):
        captured["url"] = req.full_url
        captured["header"] = req.get_header("X-api-key")
        return Resp()

    saved = {}

    def persist(season, week, matched, captured_at):
        saved["season"] = season
        saved["week"] = week
        saved["rows"] = matched
        saved["captured_at"] = captured_at
        return len(matched)

    monkeypatch.setattr(B, "urlopen", fake_urlopen)
    monkeypatch.setattr(B, "persist", persist)
    out = B.run_api(2026, 7, known_stats=KNOWN, players=FP_PLAYERS)
    assert captured["header"] == "fake-bettingpros-key"
    assert "fake-bettingpros-key" not in captured["url"]
    assert "fantasy-key-should-not-be-sent" not in captured["url"]
    assert "x-api-key" not in captured["url"]
    assert "sport=NFL" in captured["url"]
    assert "season=2026" in captured["url"]
    assert "week=7" in captured["url"]
    assert out["written"] == 1
    assert out["n_joined"] == 1
    names = {u["player"] for u in out["unmatched"]}
    assert names == {"Matt Hibner"}
    assert out["unmatched"][0]["fp_id"] == "28168"
    assert {m["market"] for m in out["rejected_markets"]} == {"rushing-attempts"}
    row = saved["rows"][0]
    assert row["player_id"] == "00-0033106"
    assert row["player_name"] == "Jared Goff"
    assert row["stat"] == "pass_yds"
    assert row["line"] == 265.5
    assert row["over_odds"] == -112
    assert row["under_odds"] == -115
    assert saved["season"] == 2026
    assert saved["week"] == 7
    assert saved["captured_at"] == datetime(2026, 10, 23, 18, 4, tzinfo=UTC)


def _props_page(page: int, n_props: int, total_pages: int, total_items: int, limit: int) -> dict:
    return {
        "_parameters": {"sport": "NFL", "season": "2026", "week": "7"},
        "_pagination": {
            "page": page, "limit": limit, "total_pages": total_pages, "total_items": total_items,
            "paginated_array": "props", "self": "/v3/props",
        },
        "props": [
            {"market_id": page * 100 + i, "event_id": 1, "participant": {"id": str(page * 100 + i)}}
            for i in range(n_props)
        ],
        "markets": [],
    }


def test_short_last_page_stores_when_total_is_high():
    """A finished walk with a short last page is complete. total_items may sit above the sum."""
    def transport(path, params, key):
        assert key == "fake-key"
        page = int(params.get("page", "1"))
        n_props = 2 if page == 1 else 1
        return 200, _props_page(page, n_props, total_pages=2, total_items=4, limit=2)

    out = B.fetch_props(2026, 7, api_key="fake-key", transport=transport, sleep=lambda _s: None)
    assert len(out["props"]) == 3


def test_full_last_page_short_of_total_writes_nothing():
    def transport(path, params, key):
        page = int(params.get("page", "1"))
        return 200, _props_page(page, 2, total_pages=2, total_items=5, limit=2)

    with pytest.raises(B.BettingProsError, match="last page is full"):
        B.fetch_props(2026, 7, api_key="fake-key", transport=transport, sleep=lambda _s: None)


def test_short_middle_page_writes_nothing():
    def transport(path, params, key):
        page = int(params.get("page", "1"))
        n_props = 2 if page == 1 else 1
        return 200, _props_page(page, n_props, total_pages=3, total_items=4, limit=2)

    with pytest.raises(B.BettingProsError, match="page 2"):
        B.fetch_props(2026, 7, api_key="fake-key", transport=transport, sleep=lambda _s: None)


def test_repeated_page_writes_nothing():
    first = _props_page(1, 2, total_pages=2, total_items=4, limit=2)

    def transport(path, params, key):
        asked = int(params.get("page", "1"))
        body = _props_page(asked, 2, total_pages=2, total_items=4, limit=2)
        if asked == 2:
            body["props"] = first["props"]
        return 200, body

    with pytest.raises(B.BettingProsError, match="repeats"):
        B.fetch_props(2026, 7, api_key="fake-key", transport=transport, sleep=lambda _s: None)


def test_api_season_mismatch_writes_nothing(monkeypatch):
    import json

    body = json.loads(json.dumps(API_BODY))
    body["_parameters"]["week"] = 6

    def transport(path, params, key):
        assert key == "fake-key"
        return 200, body

    def persist(*args, **kwargs):
        raise AssertionError("persist")

    monkeypatch.setattr(B, "persist", persist)
    with pytest.raises(B.BettingProsError, match="_parameters.week"):
        B.run_api(
            2026, 7, api_key="fake-key", transport=transport,
            known_stats=KNOWN, players=FP_PLAYERS,
        )
