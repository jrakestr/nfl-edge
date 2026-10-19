"""One DK actual per salary player for a week, in model.slate_actuals.

nflverse wins once it has the row. ESPN covers a live game and a final game nflverse
has not posted yet. A mapped player with no row in a final game is 0 (DNP). A final
game is one ESPN has marked post, or one where nflverse has player rows and both
team rows. Team rows alone are not enough.

DST points allowed use the opponent score minus opponent defensive and special-teams
scores, joined on the team code through names.TEAM_ALIASES. This module never writes
model.dfs_lineups.actual_fpts.
"""
from __future__ import annotations

from datetime import UTC, datetime

import polars as pl

from ..config import load_yaml
from ..db import execute, read_sql, upsert
from ..ingest.names import TEAM_ALIASES
from .actuals import score_weekly
from .dfs_grade import dst_actuals, dst_line, dst_points

DST_SUFFIX = "_DST"
RECON_FLAG = 0.1
REG_SECS = 3600

_ROW_SCHEMA = {
    "season": pl.Int64,
    "week": pl.Int64,
    "player_id": pl.Utf8,
    "dk_pts": pl.Float64,
    "state": pl.Utf8,
    "game_id": pl.Utf8,
    "secs_remaining": pl.Int64,
    "updated_at": pl.Datetime(time_zone="UTC"),
}


def team_code(abbr: str | None) -> str | None:
    if not abbr:
        return None
    code = abbr.upper()
    return TEAM_ALIASES.get(code, code)


def game_status(espn_state: str | None, nfl_player_rows: int, nfl_team_rows: int) -> str:
    """Final only when ESPN says so, or nflverse has player rows and both team rows."""
    if nfl_player_rows > 0 and nfl_team_rows >= 2:
        return "final"
    if espn_state == "final":
        return "final"
    if espn_state == "live":
        return "live"
    return "pending"


def skill_actual(status: str, nfl_stats: dict | None, espn_stats: dict | None,
                 rules: dict) -> tuple[float | None, str]:
    """nflverse over ESPN. No row in a final game is 0. Live with no row yet is 0 so far."""
    if nfl_stats is not None:
        return score_weekly(nfl_stats, rules)["dk"], "final"
    if espn_stats is not None:
        return score_weekly(espn_stats, rules)["dk"], "final" if status == "final" else "live"
    if status == "final":
        return 0.0, "dnp"
    if status == "live":
        return 0.0, "live"
    return None, "pending"


def dst_actual(status: str, nfl_pts: float | None, espn_pts: float | None
               ) -> tuple[float | None, str]:
    """Same precedence. A final DST with no team row stays null so the lineup is not zeroed."""
    if nfl_pts is not None:
        return float(nfl_pts), "final"
    if espn_pts is not None:
        return float(espn_pts), "final" if status == "final" else "live"
    if status == "final":
        return None, "final"
    if status == "live":
        return None, "live"
    return None, "pending"


def roster_team(player_id: str, team: str | None) -> str | None:
    if team:
        return team_code(team)
    if player_id.endswith(DST_SUFFIX):
        return team_code(player_id[: -len(DST_SUFFIX)])
    return None


def _secs(status: str, live: dict | None) -> int:
    if status == "final":
        return 0
    if live is not None and live.get("secs_remaining") is not None:
        return int(live["secs_remaining"])
    return REG_SECS


def _changed(new: dict, old: dict | None) -> bool:
    if old is None or old.get("state") != new["state"] or old.get("game_id") != new["game_id"]:
        return True
    if int(old.get("secs_remaining") or 0) != int(new["secs_remaining"] or 0):
        return True
    a, b = old.get("dk_pts"), new.get("dk_pts")
    if a is None or b is None:
        return a is not b
    return abs(float(a) - float(b)) > 0.01


def resolve(season: int, week: int, salaries: list[dict], schedules: list[dict],
            weekly_players: list[dict], weekly_teams: list[dict], live_games: list[dict],
            live_players: list[dict], live_teams: list[dict], rules: dict,
            ) -> tuple[list[dict], list[dict]]:
    """Salary-player rows and per-game ESPN-vs-nflverse recon. No database access."""
    by_team: dict[str, dict] = {}
    for g in schedules:
        rec = {
            "game_id": g.get("game_id"),
            "home": g.get("home_team"),
            "away": g.get("away_team"),
            "home_score": g.get("home_score"),
            "away_score": g.get("away_score"),
        }
        if rec["home"]:
            by_team[rec["home"]] = rec
        if rec["away"]:
            by_team[rec["away"]] = rec
    live_by_pair = {}
    for g in live_games:
        live_by_pair[(g.get("home"), g.get("away"))] = g
    player_teams: dict[str, int] = {}
    nfl_by_player = {}
    for row in weekly_players:
        pid = row.get("player_id")
        if not pid:
            continue
        nfl_by_player[pid] = row.get("stats") or {}
        team = row.get("team")
        if team:
            player_teams[team] = player_teams.get(team, 0) + 1
    team_set = {r.get("team") for r in weekly_teams if r.get("team")}
    nfl_dst = dst_actuals(weekly_teams, [
        {"home_team": g.get("home_team"), "away_team": g.get("away_team"),
         "home_score": g.get("home_score"), "away_score": g.get("away_score")}
        for g in schedules
    ], rules)
    espn_players = {r["player_id"]: r.get("stats") or {} for r in live_players if r.get("player_id")}
    espn_teams: dict[str, dict] = {}
    for row in live_teams:
        if row.get("team"):
            espn_teams[row["team"]] = row.get("stats") or {}

    rows: list[dict] = []
    both: dict[str, list[tuple[float, float]]] = {}
    for sal in salaries:
        pid = sal.get("player_id")
        if not pid:
            continue
        team = roster_team(pid, sal.get("team"))
        game = by_team.get(team) if team else None
        live = None
        if game:
            live = live_by_pair.get((game["home"], game["away"])) or live_by_pair.get(
                (game["away"], game["home"]))
        n_players = 0
        n_teams = 0
        if game:
            n_players = player_teams.get(game["home"], 0) + player_teams.get(game["away"], 0)
            n_teams = int(game["home"] in team_set) + int(game["away"] in team_set)
        status = game_status(live.get("state") if live else None, n_players, n_teams)
        secs = _secs(status, live)
        gid = game.get("game_id") if game else None
        if pid.endswith(DST_SUFFIX):
            nfl_pts = nfl_dst.get(team) if team else None
            espn_pts = _espn_dst(team, game, live, espn_teams, rules)
            pts, state = dst_actual(status, nfl_pts, espn_pts)
            if nfl_pts is not None and espn_pts is not None and gid:
                both.setdefault(gid, []).append((float(espn_pts), float(nfl_pts)))
        else:
            nfl_stats = nfl_by_player.get(pid)
            espn_stats = espn_players.get(pid)
            pts, state = skill_actual(status, nfl_stats, espn_stats, rules)
            if nfl_stats is not None and espn_stats is not None and gid:
                both.setdefault(gid, []).append((
                    score_weekly(espn_stats, rules)["dk"],
                    score_weekly(nfl_stats, rules)["dk"],
                ))
        rows.append({
            "season": season,
            "week": week,
            "player_id": pid,
            "dk_pts": pts,
            "state": state,
            "game_id": gid,
            "secs_remaining": secs,
        })
    recon = []
    for gid, pairs in both.items():
        espn_sum = sum(a for a, _ in pairs)
        nfl_sum = sum(b for _, b in pairs)
        diff = espn_sum - nfl_sum
        recon.append({
            "game_id": gid,
            "season": season,
            "week": week,
            "espn_final_pts": espn_sum,
            "nflverse_pts": nfl_sum,
            "diff": diff,
            "flagged": abs(diff) > RECON_FLAG,
        })
    return rows, recon


def _espn_dst(team: str | None, game: dict | None, live: dict | None,
              espn_teams: dict[str, dict], rules: dict) -> float | None:
    if not team or not game or not live:
        return None
    opp = game["away"] if team == game["home"] else game["home"]
    own, other = espn_teams.get(team), espn_teams.get(opp)
    if own is None or other is None:
        return None
    opp_score = live.get("away_score") if team == game["home"] else live.get("home_score")
    if opp_score is None:
        return None
    return dst_points(dst_line(own, other, float(opp_score)), rules)


def _load(season: int, week: int) -> dict:
    like = f"{season}_{week:02d}_%"
    salaries = read_sql(
        """
        select distinct on (player_id) player_id, team
        from raw.dk_salaries
        where slate_id like %s and player_id is not null
        order by player_id
        """,
        (like,),
    ).to_dicts()
    schedules = read_sql(
        """
        select game_id, home_team, away_team, home_score, away_score
        from raw.schedules
        where season = %s and week = %s and game_type = 'REG'
        """,
        (season, week),
    ).to_dicts()
    weekly_players = read_sql(
        "select player_id, team, stats from raw.player_stats_weekly where season = %s and week = %s",
        (season, week),
    ).to_dicts()
    weekly_teams = read_sql(
        "select team, opponent_team, stats from raw.team_stats_weekly where season = %s and week = %s",
        (season, week),
    ).to_dicts()
    live_games = read_sql(
        """
        select home, away, state, secs_remaining, home_score, away_score
        from raw.live_games where season = %s and week = %s
        """,
        (season, week),
    ).to_dicts()
    live_players = read_sql(
        "select player_id, stats from raw.live_player_stats where season = %s and week = %s",
        (season, week),
    ).to_dicts()
    live_teams = read_sql(
        "select team, stats from raw.live_team_stats where season = %s and week = %s",
        (season, week),
    ).to_dicts()
    return {
        "salaries": salaries, "schedules": schedules, "weekly_players": weekly_players,
        "weekly_teams": weekly_teams, "live_games": live_games, "live_players": live_players,
        "live_teams": live_teams,
    }


def index(season: int, week: int) -> dict[str, dict]:
    """player_id -> dk_pts, state, game_id, secs_remaining."""
    df = read_sql(
        """
        select player_id, dk_pts::float8 as dk_pts, state, game_id, secs_remaining
        from model.slate_actuals where season = %s and week = %s
        """,
        (season, week),
    )
    return {r["player_id"]: r for r in df.to_dicts()}


def _write_changed(season: int, week: int, rows: list[dict]) -> int:
    old = index(season, week)
    now = datetime.now(UTC)
    changed = []
    for row in rows:
        if not _changed(row, old.get(row["player_id"])):
            continue
        changed.append({**row, "updated_at": now})
    if not changed:
        return 0
    groups: dict[str, list[dict]] = {}
    for row in changed:
        groups.setdefault(row.get("game_id") or "", []).append(row)
    n = 0
    for group in groups.values():
        n += upsert(pl.DataFrame(group, schema=_ROW_SCHEMA), "model.slate_actuals",
                    ["season", "week", "player_id"])
    return n


def _write_recon(season: int, week: int, rows: list[dict]) -> list[str]:
    execute("delete from model.actuals_recon where season = %s and week = %s", (season, week))
    if not rows:
        return []
    now = datetime.now(UTC)
    frame = pl.DataFrame([{**r, "updated_at": now} for r in rows], schema={
        "game_id": pl.Utf8, "season": pl.Int64, "week": pl.Int64,
        "espn_final_pts": pl.Float64, "nflverse_pts": pl.Float64, "diff": pl.Float64,
        "flagged": pl.Boolean, "updated_at": pl.Datetime(time_zone="UTC"),
    })
    upsert(frame, "model.actuals_recon", ["game_id"])
    return [r["game_id"] for r in rows if r["flagged"]]


def run(season: int, week: int) -> dict:
    """Rebuild model.slate_actuals for every salary player that week. Does not touch lineups."""
    rules = load_yaml("scoring.yaml")
    data = _load(season, week)
    rows, recon = resolve(season, week, rules=rules, **data)
    written = _write_changed(season, week, rows)
    flagged = _write_recon(season, week, recon)
    return {
        "season": season,
        "week": week,
        "players": len(rows),
        "written": written,
        "flagged": flagged,
    }


__all__ = [
    "dst_actual", "game_status", "index", "resolve", "roster_team", "run", "skill_actual",
    "team_code",
]
