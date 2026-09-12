"""DK → gsis crosswalk. Ambiguous names stay unmatched. No database."""
import polars as pl

from nfl_edge.ingest import names as N
from nfl_edge.ingest.dk_crosswalk import resolve_row

CATALOG = pl.DataFrame({
    "gsis_id": ["00-0033873", "00-0033288", "00-0033289", "00-0031237", "00-0037837"],
    "display_name": ["Patrick Mahomes", "Joshua Kelly", "Joshua Kelly", "Teddy Bridgewater", "Puka Nacua"],
    "merge_name": ["patrick mahomes", "joshua kelly", "joshua kelly", "teddy bridgewater", "puka nacua"],
    "latest_team": ["KC", "LA", "LAC", "TB", "LA"],
    "position": ["QB", "RB", "RB", "QB", "WR"],
})

TEAMS = {
    "KC": {"city": "Kansas City", "nick": "Chiefs"},
    "LA": {"city": "Los Angeles", "nick": "Rams"},
    "LAC": {"city": "Los Angeles", "nick": "Chargers"},
    "DET": {"city": "Detroit", "nick": "Lions"},
    "TB": {"city": "Tampa Bay", "nick": "Buccaneers"},
}

RECENT = {
    "00-0033873", "00-0033288", "00-0033289", "00-0031237", "00-0037837",
}


def test_last_name_matches_lineup_card():
    assert N.last_name("Brian Robinson Jr.") == "Robinson"
    assert N.last_name("Amon-Ra St. Brown") == "St. Brown"
    assert N.last_name("Patrick Mahomes II") == "Mahomes"


def test_lar_team_alias_before_match():
    r = resolve_row(
        {"name": "Puka Nacua", "team": "LAR", "position": "WR", "player_dk_id": "1"},
        CATALOG, TEAMS,
    )
    assert r.gsis_id == "00-0037837"
    assert r.source == "name_team_pos"
    assert r.automatic is True


def test_unique_name_matches_even_when_latest_team_is_stale():
    r = resolve_row(
        {"name": "Teddy Bridgewater", "team": "DET", "position": "QB", "player_dk_id": "2"},
        CATALOG, TEAMS, recent_ids=RECENT,
    )
    assert r.gsis_id == "00-0031237"
    assert r.source == "name"


def test_unique_name_without_recent_roster_is_unmatched():
    r = resolve_row(
        {"name": "Teddy Bridgewater", "team": "DET", "position": "QB", "player_dk_id": "2"},
        CATALOG, TEAMS, recent_ids=set(),
    )
    assert r.gsis_id is None
    assert r.reason == "unmatched"


def test_ambiguous_name_is_not_guessed():
    r = resolve_row(
        {"name": "Joshua Kelly", "team": "DET", "position": "RB", "player_dk_id": "3"},
        CATALOG, TEAMS, recent_ids=RECENT,
    )
    assert r.gsis_id is None
    assert r.reason == "ambiguous"


def test_recent_same_name_splits_on_dk_position():
    catalog = CATALOG.vstack(pl.DataFrame({
        "gsis_id": ["00-0036527", "00-0038549"],
        "display_name": ["DJ Turner", "DJ Turner II"],
        "merge_name": ["dj turner", "dj turner"],
        "latest_team": ["LV", "CIN"],
        "position": ["WR", "CB"],
    }))
    recent = {"00-0036527", "00-0038549"}
    r = resolve_row(
        {"name": "DJ Turner", "team": "HOU", "position": "WR", "player_dk_id": "6"},
        catalog, TEAMS, recent_ids=recent,
    )
    assert r.gsis_id == "00-0036527"
    assert r.source == "name_recent"


def test_ambiguous_prefers_the_one_recent_roster():
    r = resolve_row(
        {"name": "Joshua Kelly", "team": "DET", "position": "RB", "player_dk_id": "3"},
        CATALOG, TEAMS, recent_ids={"00-0033289"},
    )
    assert r.gsis_id == "00-0033289"
    assert r.source == "name_recent"


def test_ambiguous_all_retired_is_unmatched():
    r = resolve_row(
        {"name": "Joshua Kelly", "team": "DET", "position": "RB", "player_dk_id": "3"},
        CATALOG, TEAMS, recent_ids=set(),
    )
    assert r.gsis_id is None
    assert r.reason == "unmatched"


def test_unknown_stays_unmatched():
    r = resolve_row(
        {"name": "Miller Moss", "team": "CHI", "position": "QB", "player_dk_id": "4"},
        CATALOG, TEAMS,
    )
    assert r.gsis_id is None
    assert r.reason == "unmatched"


def test_last_name_only_is_not_a_match():
    catalog = CATALOG.vstack(pl.DataFrame({
        "gsis_id": ["00-0028020"],
        "display_name": ["Vincent Brown"],
        "merge_name": ["vincent brown"],
        "latest_team": ["LAC"],
        "position": ["WR"],
    }))
    r = resolve_row(
        {"name": "Sincere Brown", "team": "LAC", "position": "WR", "player_dk_id": "5"},
        catalog, TEAMS,
    )
    assert r.gsis_id is None
    assert r.reason == "unmatched"


def test_apply_to_rows_keeps_existing_and_records_new():
    from nfl_edge.ingest.dk_crosswalk import apply_to_rows

    rows, new = apply_to_rows(
        [
            {"name": "Patrick Mahomes", "team": "KC", "position": "QB", "player_dk_id": "10"},
            {"name": "Teddy Bridgewater", "team": "DET", "position": "QB", "player_dk_id": "11"},
        ],
        CATALOG, TEAMS,
        existing={"10": "00-0033873"},
        recent_ids=RECENT,
    )
    assert rows[0]["player_id"] == "00-0033873"
    assert new[0]["player_dk_id"] == "11"
    assert new[0]["gsis_id"] == "00-0031237"
    assert new[0]["source"] == "name"
