"""FantasyPros news ingest: client validation, timestamp parsing, player mapping, idempotency."""
from datetime import UTC, datetime

import pytest

from nfl_edge.ingest import fantasypros as fp
from nfl_edge.ingest import fantasypros_news as fpn

SAMPLE_NEWS = {
    "sport": "NFL",
    "title": "Fantasy Player News",
    "description": "NFL player news",
    "count": 3,
    "items": [
        {
            "id": 90101,
            "created": "2026-10-16 18:30:00",
            "created_formated": "Fri, Oct 16th 6:30pm UTC",
            "author": "Beat Writer",
            "player_id": 17237,
            "team_id": "TB",
            "title": "Baker Mayfield practices in full Friday",
            "sport_id": "NFL",
            "categories": ["Injury", "News"],
            "link": "https://www.fantasypros.com/nfl/news/90101/baker-mayfield.php",
            "desc": "Baker Mayfield (thumb) practiced in full on Friday.",
            "impact": "Mayfield is on track to start Week 6 without limitations.",
        },
        {
            "id": 90102,
            "created": "2026-10-16 19:15:00",
            "created_formated": "Fri, Oct 16th 7:15pm UTC",
            "author": "Staff",
            "player_id": 999999,
            "team_id": "JAC",
            "title": "Unmapped rookie elevated from practice squad",
            "sport_id": "NFL",
            "categories": ["Transaction"],
            "link": "https://www.fantasypros.com/nfl/news/90102/rookie.php",
            "desc": "Jacksonville elevated the rookie for Sunday.",
            "impact": "Depth piece only.",
        },
        {
            "id": 90101,
            "created": "2026-10-16 18:30:00",
            "author": "Duplicate",
            "player_id": 17237,
            "team_id": "TB",
            "title": "Duplicate item id in same response",
            "sport_id": "NFL",
            "categories": ["News"],
            "link": "",
            "desc": "Dup",
            "impact": "Dup",
        },
    ],
}

TEAMS = {t: {"city": t, "nick": t} for t in ["TB", "JAX", "KC"]}


def test_client_news_params_and_validation():
    calls = []

    def transport(path, params, key):
        calls.append((path, dict(params)))
        return 200, SAMPLE_NEWS

    c = fp.Client(api_key="k", transport=transport)
    resp = c.news(category="injury", limit=50)
    assert len(resp["items"]) == 3
    assert calls == [("/nfl/news", {"limit": 50, "category": "injury"})]


def test_client_news_empty_fails_closed():
    c = fp.Client(api_key="k", transport=lambda p, q, k: (200, {"sport": "NFL", "items": []}))
    with pytest.raises(fp.FantasyProsError, match="no items"):
        c.news()


def test_client_news_wrong_sport_fails_closed():
    c = fp.Client(api_key="k", transport=lambda p, q, k: (200, {"sport": "MLB", "items": [{"id": 1}]}))
    with pytest.raises(fp.FantasyProsError, match="answered sport MLB"):
        c.news()


def test_news_rows_maps_player_normalizes_team_and_dedupes():
    seen = datetime(2026, 10, 16, 20, 0, tzinfo=UTC)
    rows, unmatched = fpn.news_rows(SAMPLE_NEWS, {"17237": "00-0034855"}, TEAMS, seen)
    assert len(rows) == 2
    baker = rows[0]
    assert baker["news_id"] == 90101
    assert baker["fp_player_id"] == "17237"
    assert baker["player_id"] == "00-0034855"
    assert baker["team"] == "TB"
    assert baker["created_at"] == datetime(2026, 10, 16, 18, 30, tzinfo=UTC)
    assert baker["first_seen_at"] == seen
    assert baker["categories"] == ["Injury", "News"]

    jax = rows[1]
    assert jax["news_id"] == 90102
    assert jax["team"] == "JAX"
    assert jax["player_id"] is None
    assert len(unmatched) == 1
    assert unmatched[0]["fp_player_id"] == "999999"


def test_run_fails_closed_before_write(monkeypatch):
    class Boom:
        calls = 1

        def news(self, category=None, limit=100, fpid=None):
            raise fp.FantasyProsError("FantasyPros /nfl/news returned HTTP 500; nothing written")

    wrote = []
    monkeypatch.setattr("nfl_edge.db.insert_ignore", lambda *a, **k: wrote.append(a))
    with pytest.raises(fp.FantasyProsError, match="nothing written"):
        fpn.run(client=Boom())
    assert wrote == []


def test_client_news_with_fpid_allows_empty_items():
    calls = []

    def transport(path, params, key):
        calls.append((path, dict(params)))
        return 200, {"sport": "NFL", "items": []}

    c = fp.Client(api_key="k", transport=transport)
    resp = c.news(limit=10, fpid=19797)
    assert resp["items"] == []
    assert calls == [("/nfl/news", {"limit": 10, "fpid": 19797})]
