"""FantasyPros v2 client: fail-closed validation and key handling. No network."""
import json
from pathlib import Path

import pytest

from nfl_edge.ingest import fantasypros as fp

FIX = Path(__file__).parent / "fixtures"


def load(name: str) -> dict:
    return json.loads((FIX / name).read_text())


class FakeTransport:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls: list[tuple[str, dict]] = []

    def __call__(self, path, params, key):
        self.calls.append((path, dict(params)))
        r = self.responses.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


def test_missing_key_message(monkeypatch):
    monkeypatch.delenv("FANTASY_PROS_API_KEY", raising=False)
    with pytest.raises(RuntimeError, match="FANTASY_PROS_API_KEY not set"):
        fp.Client()


def test_projections_ok_counts_one_call():
    t = FakeTransport([(200, load("fantasypros_projections_2026_w05.json"))])
    c = fp.Client(api_key="k", transport=t)
    resp = c.projections(2026, 5)
    assert resp["players"]
    assert c.calls == 1
    path, params = t.calls[0]
    assert path == "/nfl/2026/projections"
    assert params["week"] == 5
    assert params["positions"] == "QB:RB:WR:TE"


def test_season_week_mismatch_fails_closed():
    t = FakeTransport([(200, load("fantasypros_projections_2026_w05.json"))])
    c = fp.Client(api_key="k", transport=t)
    with pytest.raises(fp.FantasyProsError, match="week 6"):
        c.projections(2026, 6)


def test_empty_players_fails_closed():
    body = load("fantasypros_projections_2026_w05.json")
    body["players"] = []
    c = fp.Client(api_key="k", transport=FakeTransport([(200, body)]))
    with pytest.raises(fp.FantasyProsError, match="no players"):
        c.projections(2026, 5)


def test_non_200_fails_closed_without_key_in_message():
    c = fp.Client(api_key="SECRET123", transport=FakeTransport([(403, {"error": "nope"})]))
    with pytest.raises(fp.FantasyProsError) as e:
        c.injuries(2026, 5)
    assert "403" in str(e.value)
    assert "SECRET123" not in str(e.value)


def test_one_retry_on_5xx_then_ok():
    body = load("fantasypros_injuries_2026_w05.json")
    t = FakeTransport([(502, {}), (200, body)])
    c = fp.Client(api_key="k", transport=t, sleep=lambda s: None)
    assert c.injuries(2026, 5)["injuries"]
    assert c.calls == 2


def test_5xx_twice_fails():
    t = FakeTransport([(502, {}), (503, {})])
    c = fp.Client(api_key="k", transport=t, sleep=lambda s: None)
    with pytest.raises(fp.FantasyProsError, match="503"):
        c.injuries(2026, 5)
    assert c.calls == 2


def test_rankings_and_players_paths():
    t = FakeTransport([
        (200, load("fantasypros_rankings_2026_w05.json")),
        (200, load("fantasypros_players.json")),
    ])
    c = fp.Client(api_key="k", transport=t)
    c.rankings(2026, 5)
    c.players()
    assert t.calls[0][0] == "/nfl/2026/rankings"
    assert t.calls[1][0] == "/nfl/players"
    assert t.calls[1][1]["external_ids"] == "draftkings"
