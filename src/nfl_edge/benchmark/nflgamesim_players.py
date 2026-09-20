"""Ingest NFLGameSim weekly player CSVs into raw.external_players.

Benchmark only: nothing in sim/ reads this table. FantasyPoints is their
DK-style total and is stored as-is; the box columns cannot rebuild DK scoring
(no receptions, fumbles, or bonuses in the file).

CSV shape (one quoted record per player; the Player field holds two lines):
  "Player","Pass Yds","Pass TD","Pass INT","Rush Yds","Rush TD","Rec Yds","Rec TD","FantasyPoints"
  "Justin Jefferson \\nMinnesota Vikings vs Chicago Bears","0.0",...,"39.4"

Team names are full names mapped through ingest.odds_api.TEAM_NAMES (no new
mappings). player_id comes from ingest.names.match_one over raw.players; rows
that do not match uniquely are kept with player_id null and reported, never
dropped. game_id resolves from that week's REG raw.schedules on the unordered
team pair; unresolvable pairs keep game_id null and are reported.
"""
from __future__ import annotations

import csv
from pathlib import Path

import polars as pl

from ..config import ROOT
from ..ingest.odds_api import UnmappedTeam, map_team

SOURCE = "nflgamesim"

CSV_COLS = [
    "Player",
    "Pass Yds",
    "Pass TD",
    "Pass INT",
    "Rush Yds",
    "Rush TD",
    "Rec Yds",
    "Rec TD",
    "FantasyPoints",
]

STAT_COLS = {
    "Pass Yds": "pass_yds",
    "Pass TD": "pass_td",
    "Pass INT": "pass_int",
    "Rush Yds": "rush_yds",
    "Rush TD": "rush_td",
    "Rec Yds": "rec_yds",
    "Rec TD": "rec_td",
    "FantasyPoints": "fpts_dk",
}

DB_COLS = [
    "source", "season", "week", "player_id", "name", "team", "opponent",
    "game_id", "pass_yds", "pass_td", "pass_int", "rush_yds", "rush_td",
    "rec_yds", "rec_td", "fpts_dk",
]

KEY_COLS = ["source", "season", "week", "name", "team"]


class BadPlayerField(ValueError):
    """A Player field did not hold '<name>\\n<team> vs <opponent>'."""


def split_player(field: str) -> tuple[str, str, str]:
    """Split 'Name \\nTeam vs Opponent' into (name, team full name, opponent full name). Pure."""
    lines = [ln.strip() for ln in (field or "").splitlines() if ln.strip()]
    if len(lines) != 2:
        raise BadPlayerField(f"expected 2 lines, got {len(lines)}: {field!r}")
    name = lines[0]
    if " vs " not in lines[1]:
        raise BadPlayerField(f"expected '<team> vs <opponent>': {field!r}")
    team_full, opp_full = (p.strip() for p in lines[1].split(" vs ", 1))
    if not name or not team_full or not opp_full:
        raise BadPlayerField(f"empty name/team/opponent: {field!r}")
    return name, team_full, opp_full


def _num(raw: object, field: str, name: str) -> float:
    try:
        return float(str(raw).strip())
    except (TypeError, ValueError):
        raise BadPlayerField(f"{name}: {field} is not numeric: {raw!r}") from None


def parse_csv(path: Path) -> list[dict]:
    """Parse the weekly CSV into raw rows. Pure. Raises on unknown team names."""
    with open(path, newline="") as f:
        records = list(csv.DictReader(f))
    rows = []
    for rec in records:
        name, team_full, opp_full = split_player(rec.get("Player", ""))
        try:
            team = map_team(team_full)
        except UnmappedTeam as e:
            raise UnmappedTeam(f"{team_full!r} (player {name!r})") from e
        try:
            opponent = map_team(opp_full)
        except UnmappedTeam as e:
            raise UnmappedTeam(f"{opp_full!r} (player {name!r})") from e
        row = {"name": name, "team": team, "opponent": opponent}
        for csv_col, db_col in STAT_COLS.items():
            row[db_col] = _num(rec.get(csv_col), csv_col, name)
        rows.append(row)
    return rows


def game_lookup(schedules: pl.DataFrame) -> dict[frozenset, list[str]]:
    """Unordered {team, opponent} pair -> game_ids for the week's REG slate. Pure."""
    out: dict[frozenset, list[str]] = {}
    if schedules.is_empty():
        return out
    for r in schedules.iter_rows(named=True):
        key = frozenset({str(r["home_team"]), str(r["away_team"])})
        out.setdefault(key, []).append(str(r["game_id"]))
    return out


def resolve_games(rows: list[dict], schedules: pl.DataFrame) -> tuple[list[dict], list[dict]]:
    """Attach game_id; zero or duplicate pair hits keep null and are reported. Pure."""
    lookup = game_lookup(schedules)
    unresolved = []
    for row in rows:
        ids = lookup.get(frozenset({row["team"], row["opponent"]}), [])
        if len(ids) == 1:
            row["game_id"] = ids[0]
        else:
            row["game_id"] = None
            unresolved.append({
                "name": row["name"],
                "team": row["team"],
                "opponent": row["opponent"],
                "hits": len(ids),
            })
    return rows, unresolved


def attach_ids(
    rows: list[dict],
    catalog: pl.DataFrame,
    aliases: dict[str, str],
    teams: dict,
) -> tuple[list[dict], list[dict]]:
    """Match player_id via names.match_one. Unmatched stay null, never dropped. Pure."""
    from ..ingest import names as N

    prepared = catalog if "_dn" in catalog.columns else N.prepare_catalog(catalog)
    unmatched = []
    for row in rows:
        m = N.match_one({"player": row["name"], "team": row["team"]},
                        prepared, aliases, teams)
        row["player_id"] = m.player_id
        row["match_reason"] = m.reason or "matched"
        if m.player_id is None:
            unmatched.append({
                "name": row["name"],
                "team": row["team"],
                "opponent": row["opponent"],
                "reason": m.reason or "unmatched",
            })
    return rows, unmatched


def _to_db_frame(rows: list[dict], season: int, week: int) -> pl.DataFrame:
    schema = {
        "source": pl.Utf8,
        "season": pl.Int64,
        "week": pl.Int64,
        "player_id": pl.Utf8,
        "name": pl.Utf8,
        "team": pl.Utf8,
        "opponent": pl.Utf8,
        "game_id": pl.Utf8,
        "pass_yds": pl.Float64,
        "pass_td": pl.Float64,
        "pass_int": pl.Float64,
        "rush_yds": pl.Float64,
        "rush_td": pl.Float64,
        "rec_yds": pl.Float64,
        "rec_td": pl.Float64,
        "fpts_dk": pl.Float64,
    }
    recs = [{
        "source": SOURCE,
        "season": season,
        "week": week,
        "player_id": r.get("player_id"),
        "name": r["name"],
        "team": r["team"],
        "opponent": r.get("opponent"),
        "game_id": r.get("game_id"),
        **{c: r[c] for c in STAT_COLS.values()},
    } for r in rows]
    return pl.DataFrame(recs, schema=schema) if recs else pl.DataFrame(schema=schema)


def csv_path(season: int, week: int) -> Path:
    return ROOT / "data" / "benchmarks" / f"nflgamesim_players_{season}_week{week:02d}.csv"


def load_catalog() -> pl.DataFrame:
    from ..db import read_sql

    return read_sql(
        "select gsis_id, display_name, merge_name, latest_team, position from raw.players"
    )


def load_schedules(season: int, week: int) -> pl.DataFrame:
    from ..db import read_sql

    return read_sql(
        """
        select game_id, home_team, away_team
        from raw.schedules
        where season = %s and week = %s and game_type = 'REG'
        order by game_id
        """,
        (season, week),
    )


def run(
    season: int,
    week: int,
    path: Path | None = None,
    schedules: pl.DataFrame | None = None,
    catalog: pl.DataFrame | None = None,
) -> dict:
    """Parse the CSV, resolve games/ids, upsert raw.external_players. Fail closed."""
    from ..db import upsert
    from ..ingest import names as N

    src = Path(path) if path is not None else csv_path(season, week)
    rows = parse_csv(src)
    sched = load_schedules(season, week) if schedules is None else schedules
    rows, unresolved = resolve_games(rows, sched)
    cat = load_catalog() if catalog is None else catalog
    rows, unmatched = attach_ids(rows, cat, N.load_aliases(), N.load_teams())
    n = upsert(_to_db_frame(rows, season, week), "raw.external_players", KEY_COLS)
    return {
        "season": season,
        "week": week,
        "path": str(src),
        "rows": len(rows),
        "written": n,
        "matched": sum(1 for r in rows if r.get("player_id")),
        "unmatched_n": len(unmatched),
        "unmatched": unmatched,
        "games_unresolved_n": len(unresolved),
        "games_unresolved": unresolved,
    }
