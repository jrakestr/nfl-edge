"""Who actually plays offense: recent snap shares and this week's depth-chart starters.

Used by the calibration layer (players without an offensive role get no usage) and by the DFS
pool (they are left out). As-of: snap rows come only from weeks before the target week.
"""
from __future__ import annotations

from ..db import read_sql

STARTER_DEPTH = {"QB": 1, "RB": 1, "TE": 1, "WR": 3}


def recent_offense_share(rows: list[dict], games: int = 3) -> dict[str, float]:
    """Each player's best offensive snap share over his team's last `games` games.

    rows: (player_id, team, week, offense_pct) for weeks before the target week. A player with
    no row in those team games is absent from the result (no evidence either way).
    """
    team_weeks: dict[str, list[int]] = {}
    for r in rows:
        team_weeks.setdefault(r["team"], []).append(int(r["week"]))
    recent = {t: set(sorted(set(w))[-games:]) for t, w in team_weeks.items()}
    out: dict[str, float] = {}
    for r in rows:
        if int(r["week"]) not in recent.get(r["team"], set()):
            continue
        pct = float(r.get("offense_pct") or 0.0)
        out[r["player_id"]] = max(out.get(r["player_id"], 0.0), pct)
    return out


def load_recent_snaps(season: int, week: int) -> list[dict]:
    """Offensive snap shares for the season's weeks before `week`, keyed by gsis id.

    Falls back to (display_name, latest_team) when raw.players.pfr_id is missing, and emits 0.0
    for skill players who were on the roster (ACT/INA/DEV, never RES) in their team's recent games
    with zero snap rows and under 10% max offensive snaps all season.
    """
    snapped = read_sql(
        """
        select p.gsis_id as player_id, s.team, s.week, s.offense_pct::float8 as offense_pct
        from raw.snap_counts s
        join raw.players p on p.pfr_id = s.pfr_player_id
        where s.season = %s and s.week < %s and p.gsis_id is not null
        union all
        select p.gsis_id as player_id, s.team, s.week, s.offense_pct::float8 as offense_pct
        from raw.snap_counts s
        join raw.players p
          on (p.pfr_id is null or p.pfr_id = '')
         and lower(p.display_name) = lower(s.player)
         and p.latest_team = s.team
        where s.season = %s and s.week < %s and p.gsis_id is not null
        """,
        (season, week, season, week),
    ).to_dicts()
    if not snapped:
        return []
    team_weeks: dict[str, list[int]] = {}
    season_max: dict[str, float] = {}
    for r in snapped:
        team_weeks.setdefault(r["team"], []).append(int(r["week"]))
        pid = r["player_id"]
        season_max[pid] = max(season_max.get(pid, 0.0), float(r.get("offense_pct") or 0.0))
    recent = {t: set(sorted(set(w))[-3:]) for t, w in team_weeks.items()}
    recent_snapped = {
        r["player_id"] for r in snapped if int(r["week"]) in recent.get(r["team"], set())
    }
    ros = read_sql(
        """
        select gsis_id as player_id, team, week, status
        from raw.rosters_weekly
        where season = %s and week < %s
          and position in ('RB', 'WR', 'TE', 'FB', 'HB')
          and gsis_id is not null
        """,
        (season, week),
    ).to_dicts()
    by_player_team: dict[tuple[str, str], tuple[int, set[str]]] = {}
    for r in ros:
        t, w = r["team"], int(r["week"])
        if w not in recent.get(t, set()):
            continue
        key = (r["player_id"], t)
        prev_w, st = by_player_team.get(key, (w, set()))
        st.add(str(r.get("status") or ""))
        by_player_team[key] = (max(prev_w, w), st)
    zeros = [
        {"player_id": pid, "team": t, "week": max_w, "offense_pct": 0.0}
        for (pid, t), (max_w, st) in by_player_team.items()
        if pid not in recent_snapped
        and season_max.get(pid, 0.0) < 0.10
        and bool(st & {"ACT", "INA", "DEV"})
        and "RES" not in st
    ]
    return snapped + zeros


def depth_starters(depth_rows: list[dict]) -> set[str]:
    """QB1, RB1, TE1, WR1-3 from depth-chart rows (team, player_id, position, depth_rank)."""
    return {
        r["player_id"] for r in depth_rows
        if r.get("position") in STARTER_DEPTH and r.get("depth_rank") is not None
        and int(r["depth_rank"]) <= STARTER_DEPTH[r["position"]]
    }
