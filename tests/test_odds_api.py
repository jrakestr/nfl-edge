"""Spec for Odds API ingest: parse, match, HTTP key scrub. No live credits."""
from __future__ import annotations

import io
import json
import traceback
from datetime import UTC, date, datetime
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError

import polars as pl
import pytest

from nfl_edge.ingest import odds_api as O

FIXTURE = Path(__file__).parent / "fixtures" / "odds_api_sample.json"
FETCHED = datetime(2026, 9, 12, 20, 0, 0, tzinfo=UTC)
SENTINEL = "TEST_ODDS_KEY_LEAK_SENTINEL"

SCHEDULES = pl.DataFrame({
    "game_id": ["2021_01_DAL_TB"],
    "gameday": [date(2021, 9, 9)],
    "home_team": ["TB"],
    "away_team": ["DAL"],
})


def _payload() -> list[dict]:
    return json.loads(FIXTURE.read_text())


def test_et_date_snf_docs_example():
    assert O.et_date("2021-09-10T00:20:00Z") == date(2021, 9, 9)


def test_map_team_32_and_unknown():
    assert len(O.TEAM_NAMES) == 32
    assert O.map_team("Kansas City Chiefs") == "KC"
    assert O.map_team("Los Angeles Rams") == "LA"
    assert O.map_team("Washington Commanders") == "WAS"
    with pytest.raises(O.UnmappedTeam, match="Springfield Atoms"):
        O.map_team("Springfield Atoms")


def test_parse_packs_one_row_per_book_shared_fetched_at():
    out = O.parse_events(_payload(), SCHEDULES, FETCHED)
    assert out.n_matched == 1
    assert out.rows.height == 2
    assert set(out.rows["bookmaker"].to_list()) == {"unibet", "caesars"}
    assert (out.rows["source"] == "odds_api").all()
    assert (out.rows["fetched_at"] == FETCHED).all()
    assert out.rows["fetched_at"].n_unique() == 1
    unibet = out.rows.filter(pl.col("bookmaker") == "unibet").row(0, named=True)
    assert unibet["game_id"] == "2021_01_DAL_TB"
    assert unibet["captured_at"] == datetime(2021, 6, 10, 13, 33, 18, tzinfo=UTC)
    assert unibet["spread_line"] == pytest.approx(6.5)
    assert unibet["home_spread_odds"] == -111
    assert unibet["away_spread_odds"] == -109
    assert unibet["home_moneyline"] == -303
    assert unibet["away_moneyline"] == 240
    assert unibet["total_line"] == pytest.approx(51.5)
    assert unibet["over_odds"] == -110
    assert unibet["under_odds"] == -110


def test_unmapped_team_fails_before_rows():
    payload = _payload()
    payload[0]["home_team"] = "Springfield Atoms"
    with pytest.raises(O.UnmappedTeam, match="Springfield Atoms"):
        O.parse_events(payload, SCHEDULES, FETCHED)


def test_unmatched_event_skipped_zero_match_fails():
    out = O.parse_events(_payload(), SCHEDULES, FETCHED)
    assert out.n_matched == 1
    assert len(out.skipped) == 1
    skip = out.skipped[0]
    assert skip["home"] == "Kansas City Chiefs"
    assert skip["away"] == "Baltimore Ravens"
    assert skip["date"] == "2026-12-20"
    empty = O.parse_events(_payload(), SCHEDULES.clear(), FETCHED)
    assert empty.n_matched == 0
    assert len(empty.skipped) == 2
    with pytest.raises(RuntimeError, match="zero events matched"):
        O.require_matches(empty)


def test_recent_duplicate_n():
    pending = pl.DataFrame({
        "game_id": ["2021_01_DAL_TB", "2021_01_DAL_TB"],
        "bookmaker": ["unibet", "caesars"],
        "captured_at": [
            datetime(2021, 6, 10, 13, 33, 18, tzinfo=UTC),
            datetime(2021, 6, 10, 13, 33, 48, tzinfo=UTC),
        ],
    })
    existing = pl.DataFrame({
        "game_id": ["2021_01_DAL_TB"],
        "bookmaker": ["unibet"],
        "captured_at": [datetime(2021, 6, 10, 13, 33, 18, tzinfo=UTC)],
    })
    assert O.recent_duplicate_n(pending, existing) == 1
    assert O.recent_duplicate_n(pending, existing.clear()) == 0


def test_remaining_warning():
    assert O.remaining_warning(100) is None
    assert O.remaining_warning(99) == "WARNING: Odds API credits remaining=99 (<100)"
    assert O.remaining_warning(None) is None


def _http_error(code: int) -> HTTPError:
    url = (
        "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/"
        f"?apiKey={SENTINEL}&regions=us&markets=h2h"
    )
    return HTTPError(url, code, "no", hdrs=None, fp=io.BytesIO(b""))


@pytest.mark.parametrize("code", [401, 429])
def test_http_error_does_not_leak_key(code: int):
    with (
        patch("nfl_edge.ingest.odds_api.urlopen", side_effect=_http_error(code)),
        pytest.raises(RuntimeError) as ei,
    ):
        O.fetch("h2h", "us", api_key=SENTINEL)
    tb = "".join(traceback.format_exception(ei.value))
    assert SENTINEL not in str(ei.value)
    assert SENTINEL not in tb
    assert f"Odds API HTTP {code}" in str(ei.value)
    assert ei.value.__cause__ is None
    assert ei.value.__context__ is None
