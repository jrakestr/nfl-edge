"""As-of player audit state builder for Jev qualitative lineup audit.

Every state sent to Jev is strictly cut off at `as_of` (capped at the player's own game kickoff):
  - Player news (`raw.fantasypros_news`): only items with `created_at <= cutoff`, up to 5 newest.
  - Injury report (`raw.fantasypros_snapshots` endpoint='injuries'): newest snapshot with
    `fetched_at <= cutoff`, keeping the row only if its `injury_update_date` is on or before cutoff.
  - Teammates at the same position or skill group with injury/news context (`created_at <= cutoff`).
  - Depth chart role and prior-week snap trend (`week < W`).

Fail closed: if a player has neither news nor an injury report row before cutoff, `has_text_state`
is False so the caller marks the player `no_read` and makes zero Jev API calls.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from ..db import read_sql

MAX_PLAYER_NEWS = 5
MAX_TEAMMATE_NEWS = 4


@dataclass(frozen=True)
class AuditPlayerTarget:
    player_id: str
    name: str
    team: str
    position: str
    opponent: str
    game_id: str
    kickoff: datetime
    salary: int | None
    proj_dk_mean: float | None


def parse_fp_update_utc(raw: str | None) -> datetime | None:
    """Parse FantasyPros `injury_update_date` ('YYYY-MM-DD HH:MM:SS') as UTC, or None."""
    if not raw or not str(raw).strip():
        return None
    try:
        dt = datetime.fromisoformat(str(raw).strip())
        return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)
    except ValueError:
        return None


def effective_cutoff(kickoff: datetime, as_of: datetime | None = None) -> datetime:
    """Cutoff for a player: `min(as_of, kickoff)` when `as_of` is given, else `kickoff`."""
    ko = kickoff if kickoff.tzinfo is not None else kickoff.replace(tzinfo=UTC)
    if as_of is None:
        return ko
    ao = as_of if as_of.tzinfo is not None else as_of.replace(tzinfo=UTC)
    return min(ao, ko)


def filter_injury_row(
    snapshots: list[dict[str, Any]],
    player_id: str,
    cutoff: datetime,
) -> dict[str, Any] | None:
    """Newest injury snapshot for `player_id` fetched <= cutoff whose `injury_update_date` <= cutoff."""
    candidates: list[tuple[datetime, dict[str, Any]]] = []
    for row in snapshots:
        if row.get("player_id") != player_id:
            continue
        fetched = row.get("fetched_at")
        if not isinstance(fetched, datetime):
            continue
        fetched_utc = fetched if fetched.tzinfo is not None else fetched.replace(tzinfo=UTC)
        if fetched_utc > cutoff:
            continue
        payload = row.get("payload")
        if isinstance(payload, str):
            payload = json.loads(payload)
        if not isinstance(payload, dict):
            continue
        upd = parse_fp_update_utc(payload.get("injury_update_date"))
        if upd is not None and upd > cutoff:
            continue
        candidates.append((fetched_utc, payload))
    if not candidates:
        return None
    candidates.sort(key=lambda pair: pair[0], reverse=True)
    p = candidates[0][1]
    return {
        "status": str(p.get("status") or "").strip() or None,
        "injury_type": str(p.get("injury_type") or p.get("practice_report_injury_type") or "").strip() or None,
        "comment": str(p.get("comment") or "").strip() or None,
        "practice_1": p.get("practice_1"),
        "practice_2": p.get("practice_2"),
        "practice_3": p.get("practice_3"),
        "probability_of_playing": (
            float(p["probability_of_playing"])
            if p.get("probability_of_playing") not in (None, "")
            else None
        ),
        "injury_update_date": p.get("injury_update_date"),
    }


def filter_player_news(
    news_rows: list[dict[str, Any]],
    player_id: str,
    cutoff: datetime,
    limit: int = MAX_PLAYER_NEWS,
) -> list[dict[str, Any]]:
    """Up to `limit` newest news items for `player_id` with `created_at <= cutoff`."""
    matched: list[tuple[datetime, int, dict[str, Any]]] = []
    for r in news_rows:
        if r.get("player_id") != player_id:
            continue
        created = r.get("created_at")
        if not isinstance(created, datetime):
            continue
        created_utc = created if created.tzinfo is not None else created.replace(tzinfo=UTC)
        if created_utc > cutoff:
            continue
        nid = int(r.get("news_id") or 0)
        matched.append((
            created_utc,
            nid,
            {
                "created_at": created_utc.strftime("%Y-%m-%d %H:%M UTC"),
                "title": str(r.get("title") or "").strip(),
                "description": str(r.get("description") or "").strip(),
                "impact": str(r.get("impact") or "").strip(),
                "categories": list(r.get("categories") or []),
            },
        ))
    matched.sort(key=lambda t: (t[0], t[1]), reverse=True)
    return [m[2] for m in matched[:limit]]


def filter_teammate_context(
    target: AuditPlayerTarget,
    news_rows: list[dict[str, Any]],
    snapshots: list[dict[str, Any]],
    roster_names: dict[str, tuple[str, str]],
    cutoff: datetime,
) -> list[dict[str, Any]]:
    """Same-team skill players (excluding target) who have injury or news items before cutoff."""
    by_mate: dict[str, dict[str, Any]] = {}
    for pid, (name, pos) in roster_names.items():
        if pid == target.player_id:
            continue
        inj = filter_injury_row(snapshots, pid, cutoff)
        nws = filter_player_news(news_rows, pid, cutoff, limit=1)
        if inj is None and not nws:
            continue
        by_mate[pid] = {
            "name": name,
            "position": pos,
            "injury_status": inj.get("status") if inj else None,
            "injury_type": inj.get("injury_type") if inj else None,
            "practice_3": inj.get("practice_3") if inj else None,
            "latest_news": nws[0]["title"] if nws else None,
            "latest_impact": nws[0]["impact"] if nws else None,
        }
    items = list(by_mate.values())
    items.sort(key=lambda x: (0 if x["position"] == target.position else 1, x["name"]))
    return items[:MAX_TEAMMATE_NEWS]


def build_player_state(
    target: AuditPlayerTarget,
    injury: dict[str, Any] | None,
    news: list[dict[str, Any]],
    teammates: list[dict[str, Any]],
    prior_snaps: dict[str, float | None],
) -> dict[str, Any]:
    """Structured state dictionary matching backtick paths in `audit_questions.py`."""
    return {
        "player": {
            "name": target.name,
            "team": target.team,
            "position": target.position,
            "opponent": target.opponent,
            "dk_salary": target.salary,
            "prior_snap_pct_l3": prior_snaps.get("snap_pct_l3"),
            "prior_snap_pct_last": prior_snaps.get("snap_pct_last"),
        },
        "injury": injury,
        "news": news,
        "teammates": teammates,
    }


def has_text_evidence(state: dict[str, Any]) -> bool:
    """True when the player has at least one news item or an injury report row."""
    if state.get("news"):
        return True
    inj = state.get("injury")
    return isinstance(inj, dict) and any(
        inj.get(k) is not None for k in ("status", "injury_type", "comment", "practice_1", "practice_2", "practice_3")
    )


def compute_state_hash(state: dict[str, Any]) -> str:
    """Deterministic SHA-256 hex prefix (32 chars) over the canonical JSON state."""
    canonical = json.dumps(state, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()[:32]


def latest_news_timestamp(
    news_rows: list[dict[str, Any]],
    player_id: str,
    cutoff: datetime,
) -> datetime | None:
    """Latest `created_at` <= cutoff among the player's news items, or None."""
    times: list[datetime] = []
    for r in news_rows:
        if r.get("player_id") != player_id:
            continue
        c = r.get("created_at")
        if isinstance(c, datetime):
            cu = c if c.tzinfo is not None else c.replace(tzinfo=UTC)
            if cu <= cutoff:
                times.append(cu)
    return max(times) if times else None


def load_slate_audit_inputs(
    season: int,
    week: int,
    slate: str = "main",
    site: str = "dk",
    as_of: datetime | None = None,
) -> list[dict[str, Any]]:
    """Load all unique skill players in `model.dfs_lineups` (or top salary pool) for `(season, week, slate)`
    and build their as-of states.
    """
    slate_id = f"{season}_{week:02d}_{slate}"
    ko_expr = "(s.gameday + s.gametime::time) at time zone 'America/New_York'"
    sched = read_sql(
        f"select game_id, home_team, away_team, {ko_expr} as kickoff "
        f"from raw.schedules s where season = %s and week = %s and gametime is not null",
        (season, week),
    ).to_dicts()
    team_game: dict[str, tuple[str, str, datetime]] = {}
    for g in sched:
        ko = g["kickoff"]
        if isinstance(ko, datetime):
            ko_u = ko if ko.tzinfo is not None else ko.replace(tzinfo=UTC)
            team_game[g["home_team"]] = (g["away_team"], g["game_id"], ko_u)
            team_game[g["away_team"]] = (g["home_team"], g["game_id"], ko_u)

    sal_rows = read_sql(
        """
        select distinct on (player_id)
               player_id, name, team, position, salary::int as salary
        from raw.dk_salaries
        where site = %s and slate_id = %s and player_id is not null
          and position in ('QB', 'RB', 'WR', 'TE')
        order by player_id, (roster_position = 'FLEX') asc, salary desc
        """,
        (site, slate_id),
    ).to_dicts()
    if not sal_rows:
        return []

    rf_rows = read_sql(
        "select player_id, fields from model.research_fields where season = %s and week = %s",
        (season, week),
    ).to_dicts()
    rf_by_pid: dict[str, dict[str, Any]] = {}
    for r in rf_rows:
        f = r.get("fields")
        if isinstance(f, str):
            f = json.loads(f)
        rf_by_pid[r["player_id"]] = f if isinstance(f, dict) else {}

    lineup_rows = read_sql(
        """
        select l.lineup
        from model.dfs_lineups l
        join model.sim_runs r on r.run_id = l.run_id
        where r.season = %s and r.week = %s and l.site = %s and l.slate_id = %s
        order by r.created_at desc
        """,
        (season, week, site, slate_id),
    ).to_dicts()
    dk_to_pid = {
        str(r["player_dk_id"]): r["player_id"]
        for r in read_sql(
            "select player_dk_id, player_id from raw.dk_salaries "
            "where site = %s and slate_id = %s and player_dk_id is not null and player_id is not null",
            (site, slate_id),
        ).to_dicts()
    }
    exposed_pids: set[str] = set()
    for lr in lineup_rows:
        lu = lr.get("lineup")
        if isinstance(lu, str):
            lu = json.loads(lu)
        for slot in (lu or {}).get("players") or []:
            pid = slot.get("player_id") or dk_to_pid.get(str(slot.get("dk_id") or ""))
            if pid and not str(pid).endswith("_DST"):
                exposed_pids.add(str(pid))

    news_all = read_sql(
        """
        select news_id, player_id, team, created_at, title, description, impact, categories
        from raw.fantasypros_news
        where player_id is not null
        order by created_at desc
        """
    ).to_dicts()
    inj_all = read_sql(
        """
        select player_id, fetched_at, payload
        from raw.fantasypros_snapshots
        where endpoint = 'injuries' and season = %s and week = %s and player_id is not null
        order by fetched_at desc
        """,
        (season, week),
    ).to_dicts()

    by_team_roster: dict[str, dict[str, tuple[str, str]]] = {}
    for s in sal_rows:
        by_team_roster.setdefault(s["team"], {})[s["player_id"]] = (s["name"], s["position"])

    out: list[dict[str, Any]] = []
    for s in sal_rows:
        pid = s["player_id"]
        team = s["team"]
        if team not in team_game:
            continue
        opp, gid, ko = team_game[team]
        rf = rf_by_pid.get(pid, {})
        proj = rf.get("sim_dk_mean")
        target = AuditPlayerTarget(
            player_id=pid,
            name=s["name"],
            team=team,
            position=s["position"],
            opponent=opp,
            game_id=gid,
            kickoff=ko,
            salary=s["salary"],
            proj_dk_mean=float(proj) if proj is not None else None,
        )
        cutoff = effective_cutoff(ko, as_of)
        inj = filter_injury_row(inj_all, pid, cutoff)
        nws = filter_player_news(news_all, pid, cutoff)
        mates = filter_teammate_context(
            target, news_all, inj_all, by_team_roster.get(team, {}), cutoff
        )
        snaps = {
            "snap_pct_l3": (
                round(float(rf["snap_pct_l3"]), 3) if rf.get("snap_pct_l3") is not None else None
            ),
            "snap_pct_last": (
                round(float(rf["snap_pct_last"]), 3) if rf.get("snap_pct_last") is not None else None
            ),
        }
        state = build_player_state(target, inj, nws, mates, snaps)
        out.append({
            "target": target,
            "in_lineup": pid in exposed_pids,
            "cutoff": cutoff,
            "state": state,
            "state_hash": compute_state_hash(state),
            "has_text_state": has_text_evidence(state),
            "news_asof": latest_news_timestamp(news_all, pid, cutoff),
        })
    out.sort(
        key=lambda x: (
            0 if x["in_lineup"] else 1,
            -(x["target"].proj_dk_mean or 0.0),
            -(x["target"].salary or 0),
            x["target"].name,
        )
    )
    return out
