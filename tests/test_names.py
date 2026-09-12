"""Name matching for injury overrides and DK salary ingest. No database."""
import polars as pl

from nfl_edge.ingest import names as N

CATALOG = pl.DataFrame({
    "gsis_id": ["00-0033873", "00-0033288", "00-0033289"],
    "display_name": ["Patrick Mahomes", "Joshua Kelly", "Joshua Kelly"],
    "merge_name": ["patrick mahomes", "joshua kelly", "joshua kelly"],
    "latest_team": ["KC", "LA", "LAC"],
    "position": ["QB", "RB", "RB"],
})

TEAMS = {
    "KC": {"city": "Kansas City", "nick": "Chiefs"},
    "LA": {"city": "Los Angeles", "nick": "Rams"},
    "LAC": {"city": "Los Angeles", "nick": "Chargers"},
    "DET": {"city": "Detroit", "nick": "Lions"},
}


def test_merge_key_strips_punctuation_and_suffixes():
    assert N.merge_key("Ja'Marr Chase") == "jamarr chase"
    assert N.merge_key("Patrick Mahomes II") == "patrick mahomes"
    assert N.merge_key("James Cook III") == "james cook"
    assert N.merge_key("Brian Robinson Jr.") == "brian robinson"
    assert N.merge_key("A.J. Brown") == "aj brown"


def test_last_name_skips_suffix_and_keeps_compound():
    assert N.last_name("Brian Robinson Jr.") == "Robinson"
    assert N.last_name("Patrick Mahomes II") == "Mahomes"
    assert N.last_name("Amon-Ra St. Brown") == "St. Brown"


def test_gsis_id_passthrough():
    r = N.match_one({"player": "00-0033873"}, CATALOG, {}, TEAMS)
    assert r.player_id == "00-0033873"
    assert r.reason is None


def test_unique_display_name():
    r = N.match_one({"player": "Patrick Mahomes"}, CATALOG, {}, TEAMS)
    assert r.player_id == "00-0033873"


def test_ambiguous_name_without_team_is_unmatched():
    r = N.match_one({"player": "Joshua Kelly"}, CATALOG, {}, TEAMS)
    assert r.player_id is None
    assert r.reason == "ambiguous"


def test_team_disambiguates():
    r = N.match_one({"player": "Joshua Kelly", "team": "LAC"}, CATALOG, {}, TEAMS)
    assert r.player_id == "00-0033289"


def test_dst_by_nick_and_by_team_position():
    assert N.match_one({"player": "Chiefs", "position": "DST"}, CATALOG, {}, TEAMS).player_id == "KC_DST"
    assert N.match_one({"player": "KC", "position": "D"}, CATALOG, {}, TEAMS).player_id == "KC_DST"
    assert N.match_one({"player": "Kansas City"}, CATALOG, {}, TEAMS).player_id == "KC_DST"


def test_alias_leftover():
    aliases = {"pat mahomes": "00-0033873"}
    r = N.match_one({"player": "Pat Mahomes"}, CATALOG, aliases, TEAMS)
    assert r.player_id == "00-0033873"


def test_unknown_name_unmatched():
    r = N.match_one({"player": "Nobody Fake"}, CATALOG, {}, TEAMS)
    assert r.player_id is None
    assert r.reason == "unmatched"


def test_parse_overrides_csv_two_rows(tmp_path):
    p = tmp_path / "ov.csv"
    p.write_text(
        "player,status,usage_multiplier,note,team,position\n"
        "00-0033873,out,0,knee,\n"
        "Patrick Mahomes,questionable,1.0,ankle,KC,QB\n"
    )
    rows = N.parse_overrides_csv(p)
    assert len(rows) == 2
    assert rows[0]["player"] == "00-0033873"
    assert rows[0]["status"] == "out"
    assert rows[1]["status"] == "questionable"
    assert rows[1]["usage_multiplier"] == 1.0


def test_apply_overrides_reports_unmatched():
    rows = [
        {"player": "00-0033873", "status": "out", "usage_multiplier": 1.0, "note": "x"},
        {"player": "Ghost", "status": "doubtful", "usage_multiplier": 1.0, "note": ""},
        {"player": "Joshua Kelly", "status": "questionable", "usage_multiplier": 1.0, "note": ""},
    ]
    matched, unmatched = N.apply_overrides(rows, CATALOG, {}, TEAMS)
    assert matched.height == 1
    assert matched["player_id"].to_list() == ["00-0033873"]
    assert {u["player"] for u in unmatched} == {"Ghost", "Joshua Kelly"}


def test_invalid_status_unmatched():
    matched, unmatched = N.apply_overrides(
        [{"player": "00-0033873", "status": "probable", "usage_multiplier": 1.0, "note": ""}],
        CATALOG, {}, TEAMS,
    )
    assert matched.is_empty()
    assert unmatched[0]["reason"] == "bad_status"


def test_zero_usage_multiplier_is_kept():
    matched, unmatched = N.apply_overrides(
        [{"player": "00-0033873", "status": "out", "usage_multiplier": 0.0, "note": "x"}],
        CATALOG, {}, TEAMS,
    )
    assert unmatched == []
    assert matched["usage_multiplier"].to_list() == [0.0]


def test_dk_lar_matches_nflverse_la_player_and_dst():
    catalog = pl.DataFrame({
        "gsis_id": ["00-0037837"],
        "display_name": ["Puka Nacua"],
        "merge_name": ["puka nacua"],
        "latest_team": ["LA"],
        "position": ["WR"],
    })
    player = N.match_one(
        {"player": "Puka Nacua", "team": "LAR", "position": "WR"}, catalog, {}, TEAMS,
    )
    assert player.player_id == "00-0037837"
    assert player.reason is None
    dst = N.match_one(
        {"player": "Rams", "team": "LAR", "position": "DST"}, catalog, {}, TEAMS,
    )
    assert dst.player_id == "LA_DST"
    named = N.match_one(
        {"player": "LAR", "team": "LAR", "position": "DST"}, catalog, {}, TEAMS,
    )
    assert named.player_id == "LA_DST"
