"""Spec for NFLGameSim player ingest: parse both weekly files, map, match. No database."""
from __future__ import annotations

from pathlib import Path

import polars as pl
import pytest

from nfl_edge.benchmark import nflgamesim_players as P
from nfl_edge.ingest.odds_api import UnmappedTeam

WEEK01 = Path(__file__).parent.parent / "data" / "benchmarks" / "nflgamesim_players_2026_week01.csv"
WEEK02 = Path(__file__).parent.parent / "data" / "benchmarks" / "nflgamesim_players_2026_week02.csv"

TEAMS = {
    "MIN": {"city": "Minnesota", "nick": "Vikings"},
    "CHI": {"city": "Chicago", "nick": "Bears"},
    "TB": {"city": "Tampa Bay", "nick": "Buccaneers"},
    "CLE": {"city": "Cleveland", "nick": "Browns"},
    "ARI": {"city": "Arizona", "nick": "Cardinals"},
}

CATALOG = pl.DataFrame({
    "gsis_id": ["00-0034587", "00-0036971", "00-0099991", "00-0099992"],
    "display_name": ["Justin Jefferson", "Baker Mayfield", "David Johnson", "David Johnson"],
    "merge_name": ["Justin Jefferson", "Baker Mayfield", "David Johnson", "David Johnson"],
    "latest_team": ["MIN", "TB", "ARI", "ARI"],
    "position": ["WR", "QB", "RB", "RB"],
})


def test_parse_week02_row_count_and_jefferson():
    rows = P.parse_csv(WEEK02)
    assert len(rows) == 475
    jeff = next(r for r in rows if r["name"] == "Justin Jefferson")
    assert jeff["team"] == "MIN"
    assert jeff["opponent"] == "CHI"
    assert jeff["rec_yds"] == pytest.approx(152.0)
    assert jeff["rec_td"] == pytest.approx(1.5)
    assert jeff["fpts_dk"] == pytest.approx(39.4)


def test_parse_week01_row_count_and_gibbs():
    rows = P.parse_csv(WEEK01)
    assert len(rows) == 486
    gibbs = next(r for r in rows if r["name"] == "Jahmyr Gibbs")
    assert gibbs["team"] == "DET"
    assert gibbs["opponent"] == "NO"
    assert gibbs["fpts_dk"] == pytest.approx(36.9)


def test_split_player_bad_shape():
    with pytest.raises(P.BadPlayerField):
        P.split_player("Just A Name")
    with pytest.raises(P.BadPlayerField):
        P.split_player("Name\nNo Versus Here")


def test_unknown_team_raises_not_dropped():
    bad = WEEK02.parent / "tmp_bad_team.csv"
    bad.write_text(
        '"Player","Pass Yds","Pass TD","Pass INT","Rush Yds","Rush TD","Rec Yds","Rec TD","FantasyPoints"\n'
        '"Springfield Atom \nSpringfield Atoms vs Chicago Bears",'
        '"0.0","0.0","0.0","0.0","0.0","0.0","0.0","0.0"\n'
    )
    try:
        with pytest.raises(UnmappedTeam, match="Springfield Atoms"):
            P.parse_csv(bad)
    finally:
        bad.unlink()


def test_attach_unique_alias_ambiguous_unmatched():
    rows = [
        {"name": "Justin Jefferson", "team": "MIN", "opponent": "CHI"},
        {"name": "Some Guy", "team": "MIN", "opponent": "CHI"},
        {"name": "David Johnson", "team": "ARI", "opponent": "CHI"},
        {"name": "Nobody Here", "team": "MIN", "opponent": "CHI"},
    ]
    matched, unmatched = P.attach_ids(rows, CATALOG, {"some guy": "00-0000001"}, TEAMS)
    by_name = {r["name"]: r for r in matched}
    assert by_name["Justin Jefferson"]["player_id"] == "00-0034587"
    assert by_name["Some Guy"]["player_id"] == "00-0000001"
    assert by_name["David Johnson"]["player_id"] is None
    assert by_name["David Johnson"]["match_reason"] == "ambiguous"
    assert by_name["Nobody Here"]["player_id"] is None
    assert {u["name"] for u in unmatched} == {"David Johnson", "Nobody Here"}


def test_resolve_games_unique_zero_duplicate():
    sched = pl.DataFrame({
        "game_id": ["2026_02_MIN_CHI", "2026_02_TB_CLE", "2026_02_TB_CLE"],
        "home_team": ["CHI", "CLE", "CLE"],
        "away_team": ["MIN", "TB", "TB"],
    })
    rows = [
        {"name": "A", "team": "MIN", "opponent": "CHI"},
        {"name": "B", "team": "TB", "opponent": "CLE"},
        {"name": "C", "team": "NE", "opponent": "SEA"},
    ]
    out, unresolved = P.resolve_games(rows, sched)
    assert out[0]["game_id"] == "2026_02_MIN_CHI"
    assert out[1]["game_id"] is None  # duplicate pair stays null
    assert out[2]["game_id"] is None  # unknown pair stays null
    assert {(u["name"], u["hits"]) for u in unresolved} == {("B", 2), ("C", 0)}
