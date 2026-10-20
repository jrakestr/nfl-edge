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
    """Offensive snap shares for the season's weeks before `week`, keyed by gsis id."""
    return read_sql(
        "select p.gsis_id as player_id, s.team, s.week, s.offense_pct::float8 as offense_pct "
        "from raw.snap_counts s join raw.players p on p.pfr_id = s.pfr_player_id "
        "where s.season = %s and s.week < %s and p.gsis_id is not null",
        (season, week),
    ).to_dicts()


def depth_starters(depth_rows: list[dict]) -> set[str]:
    """QB1, RB1, TE1, WR1-3 from depth-chart rows (team, player_id, position, depth_rank)."""
    return {
        r["player_id"] for r in depth_rows
        if r.get("position") in STARTER_DEPTH and r.get("depth_rank") is not None
        and int(r["depth_rank"]) <= STARTER_DEPTH[r["position"]]
    }
