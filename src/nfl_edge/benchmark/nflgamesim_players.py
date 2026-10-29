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

OPTIONAL_STAT_COLS = ("pass_att", "pass_cmp", "rush_att", "rec")

DB_COLS = [
    "source", "season", "week", "player_id", "name", "team", "opponent",
    "game_id", "pass_att", "pass_cmp", "pass_yds", "pass_td", "pass_int",
    "rush_att", "rush_yds", "rush_td", "rec", "rec_yds", "rec_td", "fpts_dk",
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
        row = {
            "name": name,
            "team": team,
            "opponent": opponent,
            "team_full": team_full,
            "opp_full": opp_full,
        }
        for csv_col, db_col in STAT_COLS.items():
            row[db_col] = _num(rec.get(csv_col), csv_col, name)
        rows.append(row)
    return rows


def _dk_offense_fpts(row: dict, rules: dict) -> float:
    r = rules["dk"]
    pass_yds = row.get("pass_yds") or 0.0
    pass_td = row.get("pass_td") or 0.0
    pass_int = row.get("pass_int") or 0.0
    rush_yds = row.get("rush_yds") or 0.0
    rush_td = row.get("rush_td") or 0.0
    rec = row.get("rec") or 0.0
    rec_yds = row.get("rec_yds") or 0.0
    rec_td = row.get("rec_td") or 0.0
    pts = (
        pass_yds * r["pass_yd"] + pass_td * r["pass_td"] + pass_int * r["int"]
        + rush_yds * r["rush_yd"] + rush_td * r["rush_td"]
        + rec * r["rec"] + rec_yds * r["rec_yd"] + rec_td * r["rec_td"]
    )
    if pass_yds >= 300.0:
        pts += r.get("pass_300_bonus", 0)
    if rush_yds >= 100.0:
        pts += r.get("rush_100_bonus", 0)
    if rec_yds >= 100.0:
        pts += r.get("rec_100_bonus", 0)
    return round(pts, 1)


def _dk_dst_fpts(pts_allowed: float, sacks: float, ints: float, rules: dict) -> float:
    r = rules["dst"]
    pa_pts = -4.0
    for b in sorted(r["points_allowed"], key=lambda x: x["max"]):
        if round(pts_allowed) <= b["max"]:
            pa_pts = float(b["pts"])
            break
    return round(pa_pts + sacks * r["sack"] + ints * r["int"], 2)


def parse_paste(
    text: str,
    schedules: pl.DataFrame | None = None,
    scoring_rules: dict | None = None,
) -> list[dict]:
    """Parse an NFLGameSim multi-table paste (Fantasy Points, Passing, Rushing, Receiving,
    Kicking, Punting, Defense) into merged player rows. Pure.
    """
    if scoring_rules is None:
        from ..config import load_yaml

        scoring_rules = load_yaml("scoring.yaml")

    full_by_abbr: dict[str, str] = {}
    from ..ingest.odds_api import TEAM_NAMES

    for full_name, abbr in TEAM_NAMES.items():
        full_by_abbr.setdefault(abbr, full_name)

    opp_by_team: dict[str, str] = {}
    if schedules is not None and not schedules.is_empty():
        for s in schedules.iter_rows(named=True):
            h, a = str(s["home_team"]), str(s["away_team"])
            opp_by_team[h] = a
            opp_by_team[a] = h

    lines = [ln.strip() for ln in (text or "").splitlines()]
    section: str | None = None
    players: dict[tuple[str, str], dict] = {}
    i = 0
    while i < len(lines):
        ln = lines[i]
        if not ln or ln.startswith("Show All"):
            i += 1
            continue
        if ln.startswith("Fantasy Points"):
            section = "fpts"
            i += 1
            while i < len(lines) and (lines[i].startswith("Player\t") or lines[i] == "Points"):
                i += 1
            continue
        if ln in ("Passing", "Rushing", "Receiving", "Kicking", "Punting", "Defense"):
            section = ln.lower()
            i += 1
            if i < len(lines) and (lines[i].startswith("Player\t") or lines[i].startswith("Team\t")):
                i += 1
            continue

        if section == "defense":
            if "\t" in ln:
                parts = [p.strip() for p in ln.split("\t")]
                team_full = parts[0]
                try:
                    team = map_team(team_full)
                except UnmappedTeam as e:
                    raise UnmappedTeam(f"{team_full!r} (defense)") from e
                opp = opp_by_team.get(team)
                if not opp:
                    i += 1
                    continue
                opp_full = full_by_abbr.get(opp, opp)
                vals = [_num(x, "defense", team_full) for x in parts[1:]]
                # PTS ALLOWED, TKLS, TFL, SACKS, INTS
                pts_allowed, _, _, sacks, ints = vals[:5]
                key = (team_full, team)
                players[key] = {
                    "name": team_full,
                    "team": team,
                    "opponent": opp,
                    "team_full": team_full,
                    "opp_full": opp_full,
                    "position": "DST",
                    "pass_att": None,
                    "pass_cmp": None,
                    "pass_yds": 0.0,
                    "pass_td": 0.0,
                    "pass_int": 0.0,
                    "rush_att": None,
                    "rush_yds": 0.0,
                    "rush_td": 0.0,
                    "rec": None,
                    "rec_yds": 0.0,
                    "rec_td": 0.0,
                    "fpts_dk": _dk_dst_fpts(pts_allowed, sacks, ints, scoring_rules),
                }
            i += 1
            continue

        if i + 1 < len(lines) and "\t" in lines[i + 1] and " vs " in lines[i + 1]:
            name = ln
            parts = [p.strip() for p in lines[i + 1].split("\t")]
            matchup = parts[0]
            team_full, opp_full = (p.strip() for p in matchup.split(" vs ", 1))
            try:
                team = map_team(team_full)
            except UnmappedTeam as e:
                raise UnmappedTeam(f"{team_full!r} (player {name!r})") from e
            try:
                opp = map_team(opp_full)
            except UnmappedTeam as e:
                raise UnmappedTeam(f"{opp_full!r} (player {name!r})") from e
            vals = [_num(x, section or "stat", name) for x in parts[1:]]

            if section == "punting":
                i += 2
                continue

            key = (name, team)
            rec = players.setdefault(
                key,
                {
                    "name": name,
                    "team": team,
                    "opponent": opp,
                    "team_full": team_full,
                    "opp_full": opp_full,
                    "pass_att": None,
                    "pass_cmp": None,
                    "pass_yds": 0.0,
                    "pass_td": 0.0,
                    "pass_int": 0.0,
                    "rush_att": None,
                    "rush_yds": 0.0,
                    "rush_td": 0.0,
                    "rec": None,
                    "rec_yds": 0.0,
                    "rec_td": 0.0,
                    "fpts_dk": None,
                    "_has_fpts": False,
                },
            )
            if section == "fpts":
                (
                    rec["pass_yds"],
                    rec["pass_td"],
                    rec["pass_int"],
                    rec["rush_yds"],
                    rec["rush_td"],
                    rec["rec_yds"],
                    rec["rec_td"],
                    rec["fpts_dk"],
                ) = vals[:8]
                rec["_has_fpts"] = True
            elif section == "passing":
                # ATT, CP, PCT, YDS, AVG, TD, INT, LG, RTG
                rec["pass_att"] = vals[0]
                rec["pass_cmp"] = vals[1]
                if not rec["_has_fpts"]:
                    rec["pass_yds"] = vals[3]
                    rec["pass_td"] = vals[5]
                    rec["pass_int"] = vals[6]
            elif section == "rushing":
                # ATT, YDS, AVG, LG, TD
                rec["rush_att"] = vals[0]
                if not rec["_has_fpts"]:
                    rec["rush_yds"] = vals[1]
                    rec["rush_td"] = vals[4]
            elif section == "receiving":
                # ATT, YDS, AVG, LG, TD
                rec["rec"] = vals[0]
                if not rec["_has_fpts"]:
                    rec["rec_yds"] = vals[1]
                    rec["rec_td"] = vals[4]
            elif section == "kicking":
                # ATT, MADE, PCT, LG, XP, PTS
                rec["fpts_dk"] = vals[5]
            i += 2
            continue

        i += 1

    rows = []
    for rec in players.values():
        rec.pop("_has_fpts", None)
        if rec["fpts_dk"] is None:
            rec["fpts_dk"] = _dk_offense_fpts(rec, scoring_rules)
        rows.append(rec)
    rows.sort(key=lambda r: (-r["fpts_dk"], r["name"]))
    return rows


def write_csv(rows: list[dict], path: Path) -> Path:
    """Write rows in the canonical 9-column NFLGameSim player CSV format."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.writer(f, quoting=csv.QUOTE_ALL, lineterminator="\n")
        w.writerow(CSV_COLS)
        for r in rows:
            player_cell = f"{r['name']} \n{r['team_full']} vs {r['opp_full']}"
            w.writerow([
                player_cell,
                f"{r['pass_yds']:.1f}",
                f"{r['pass_td']:.1f}",
                f"{r['pass_int']:.1f}",
                f"{r['rush_yds']:.1f}",
                f"{r['rush_td']:.1f}",
                f"{r['rec_yds']:.1f}",
                f"{r['rec_td']:.1f}",
                f"{r['fpts_dk']:.1f}",
            ])
    return path


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
        m = N.match_one(
            {
                "player": row["name"],
                "team": row["team"],
                "position": row.get("position"),
            },
            prepared,
            aliases,
            teams,
        )
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
        "pass_att": pl.Float64,
        "pass_cmp": pl.Float64,
        "pass_yds": pl.Float64,
        "pass_td": pl.Float64,
        "pass_int": pl.Float64,
        "rush_att": pl.Float64,
        "rush_yds": pl.Float64,
        "rush_td": pl.Float64,
        "rec": pl.Float64,
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
        **{c: r.get(c) for c in OPTIONAL_STAT_COLS},
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
    """Parse the CSV or paste, resolve games/ids, upsert raw.external_players. Fail closed."""
    from ..db import upsert
    from ..ingest import names as N

    src = Path(path) if path is not None else csv_path(season, week)
    sched = load_schedules(season, week) if schedules is None else schedules
    first_line = src.read_text().splitlines()[0].strip() if src.exists() else ""
    if first_line.startswith("Fantasy Points") or "\t" in first_line:
        rows = parse_paste(src.read_text(), schedules=sched)
        write_csv(rows, csv_path(season, week))
    else:
        rows = parse_csv(src)
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
