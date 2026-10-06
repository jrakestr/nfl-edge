"""ESPN fantasy league (League of Champions) -> fantasy.loc_* tables.

Not an input to sim/ or priors/. The web league pages read this schema. One explicit pull per run,
authenticated with the ESPN_S2 / ESPN_SWID browser cookies (never printed or logged). Every ESPN call
happens before the first write, so a rejected cookie or an incomplete pull writes nothing.

Writes (keys are each table's primary key):
  loc_league_settings, loc_scoring_rules, loc_teams   upsert, always refreshed
  loc_weekly_scores                                    upsert; is_final = every REG game that week has a
                                                       result in raw.schedules (week-level, not per team)
  loc_player_week_scores, loc_rosters                  replaced for the weeks written, so a player who left
                                                       a lineup does not linger (rosters: current week only)
  loc_transactions                                     replaced for the season; the table has no natural key
  loc_status_snapshots                                 APPEND-ONLY (insert; a trigger rejects update/delete): one
                                                       set per pull of the current week's rosters, every
                                                       rostered player, stamped pulled_at
  loc_available                                        replaced for the season: ESPN's current FREEAGENT and
                                                       WAIVERS pool (one player request, limit 200), including
                                                       season_pts and season_proj. A failed or empty pool
                                                       writes nothing, including no snapshot
  loc_luck                                             replaced for the season after the weekly scores are
                                                       written (espn_luck.compute_luck; bias and sd refit)
`--snapshot-only` appends the status snapshot and replaces the available pool. No scores.
Timestamps from ESPN (epoch ms) are stored as America/Phoenix wall-clock, matching trade_deadline.
waiver_at is the exception: it is UTC.
"""
from __future__ import annotations

from datetime import UTC, datetime
from zoneinfo import ZoneInfo

import polars as pl

from ..config import espn_credentials

LEAGUE_ID = 79530409
LOCAL_TZ = ZoneInfo("America/Phoenix")
POOL_LIMIT = 200
POOL_STATUSES = ("WAIVERS", "FREEAGENT")
WEEKDAYS = ("MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY")
TXN_TYPES = ("FREEAGENT", "WAIVER", "WAIVER_ERROR", "ROSTER")
TS = pl.Datetime("us")

SCHEMAS: dict[str, dict] = {
    "fantasy.loc_league_settings": {
        "season": pl.Int64, "espn_league_id": pl.Int64, "league_name": pl.Utf8, "num_teams": pl.Int64,
        "regular_season_weeks": pl.Int64, "playoff_teams": pl.Int64, "scoring_type": pl.Utf8,
        "tie_rule": pl.Utf8, "faab_budget": pl.Int64, "faab_min_bid": pl.Int64,
        "acquisition_limit": pl.Int64, "waiver_process_days": pl.List(pl.Utf8),
        "waiver_process_hour": pl.Int64, "trade_deadline": TS, "veto_votes_required": pl.Int64,
        "roster_slots": pl.Struct, "as_of": pl.Datetime("us", "UTC"),
    },
    "fantasy.loc_scoring_rules": {
        "season": pl.Int64, "abbr": pl.Utf8, "stat": pl.Utf8, "points": pl.Float64,
    },
    "fantasy.loc_teams": {
        "season": pl.Int64, "espn_team_id": pl.Int64, "team": pl.Utf8, "abbrev": pl.Utf8,
        "owner": pl.Utf8, "faab_spent": pl.Int64, "faab_remaining": pl.Int64,
        "acquisitions": pl.Int64, "drops": pl.Int64, "trades": pl.Int64,
        "as_of": pl.Datetime("us", "UTC"),
    },
    "fantasy.loc_weekly_scores": {
        "season": pl.Int64, "week": pl.Int64, "team": pl.Utf8, "opp_team": pl.Utf8,
        "proj_pts": pl.Float64, "actual_pts": pl.Float64, "is_final": pl.Boolean,
        "recorded_at": pl.Datetime("us", "UTC"), "espn_team_id": pl.Int64,
        "opp_espn_team_id": pl.Int64,
    },
    "fantasy.loc_player_week_scores": {
        "season": pl.Int64, "week": pl.Int64, "espn_team_id": pl.Int64, "player": pl.Utf8,
        "position": pl.Utf8, "nfl_team": pl.Utf8, "opponent": pl.Utf8, "slot": pl.Utf8,
        "proj_pts": pl.Float64, "actual_pts": pl.Float64, "status_at_pull": pl.Utf8,
        "pulled_at": pl.Datetime("us", "UTC"),
    },
    "fantasy.loc_rosters": {
        "season": pl.Int64, "week": pl.Int64, "espn_team_id": pl.Int64, "player": pl.Utf8,
        "position": pl.Utf8, "nfl_team": pl.Utf8, "slot": pl.Utf8, "status_at_pull": pl.Utf8,
        "season_pts": pl.Float64, "season_proj": pl.Float64, "pulled_at": pl.Datetime("us", "UTC"),
    },
    "fantasy.loc_status_snapshots": {
        "season": pl.Int64, "week": pl.Int64, "espn_team_id": pl.Int64, "player": pl.Utf8,
        "pulled_at": pl.Datetime("us", "UTC"), "position": pl.Utf8, "nfl_team": pl.Utf8,
        "slot": pl.Utf8, "status": pl.Utf8,
    },
    "fantasy.loc_luck": {
        "season": pl.Int64, "week": pl.Int64, "espn_team_id": pl.Int64, "proj_win_prob": pl.Float64,
        "earned_win_prob": pl.Float64, "actual_win": pl.Float64, "allplay_share": pl.Float64,
        "bias": pl.Float64, "sd": pl.Float64, "n_team_weeks": pl.Int64,
        "computed_at": pl.Datetime("us", "UTC"),
    },
    "fantasy.loc_transactions": {
        "season": pl.Int64, "week": pl.Int64, "espn_ts": TS, "espn_team_id": pl.Int64,
        "txn_type": pl.Utf8, "status": pl.Utf8, "bid": pl.Int64, "item_type": pl.Utf8,
        "player": pl.Utf8, "group_key": pl.Utf8, "note": pl.Utf8,
    },
    "fantasy.loc_available": {
        "season": pl.Int64, "week": pl.Int64, "espn_player_id": pl.Int64, "player": pl.Utf8,
        "position": pl.Utf8, "nfl_team": pl.Utf8, "injury_status": pl.Utf8,
        "percent_owned": pl.Float64, "on_bye": pl.Boolean, "availability": pl.Utf8,
        "waiver_at": pl.Datetime("us", "UTC"), "pulled_at": pl.Datetime("us", "UTC"),
        "season_pts": pl.Float64, "season_proj": pl.Float64,
    },
}
KEYS = {
    "fantasy.loc_league_settings": ["season"],
    "fantasy.loc_scoring_rules": ["season", "abbr"],
    "fantasy.loc_teams": ["season", "espn_team_id"],
    "fantasy.loc_weekly_scores": ["season", "week", "team"],
    "fantasy.loc_player_week_scores": ["season", "week", "espn_team_id", "player"],
    "fantasy.loc_rosters": ["season", "week", "espn_team_id", "player"],
    "fantasy.loc_luck": ["season", "week", "espn_team_id"],
    "fantasy.loc_available": ["season", "espn_player_id"],
    "fantasy.loc_status_snapshots": ["season", "week", "espn_team_id", "player", "pulled_at"],
    # No primary key on the real table; this is the natural identity of one item.
    "fantasy.loc_transactions": ["group_key", "item_type", "espn_team_id", "player"],
}


def _frame(table: str, rows: list[dict]) -> pl.DataFrame:
    # roster_slots is a dict column (jsonb); polars infers its struct fields from the row itself.
    schema = {k: v for k, v in SCHEMAS[table].items() if v is not pl.Struct}
    return pl.DataFrame(rows, schema_overrides=schema)


def _ts(ms: float | None) -> datetime | None:
    if not ms:
        return None
    return datetime.fromtimestamp(ms / 1000, LOCAL_TZ).replace(tzinfo=None)


def _r2(x: float | None) -> float | None:
    return None if x is None else round(float(x), 2)


def _clean(s: object) -> str:
    return str(s).strip()


def connect(season: int):
    """Authenticated League, or a plain-language RuntimeError. Cookie values never appear in errors."""
    from espn_api.football import League
    from espn_api.requests.espn_requests import (
        ESPNAccessDenied,
        ESPNInvalidLeague,
        ESPNUnknownError,
    )

    s2, swid = espn_credentials()
    try:
        return League(league_id=LEAGUE_ID, year=season, espn_s2=s2, swid=swid)
    except ESPNAccessDenied:
        raise RuntimeError(
            "ESPN rejected ESPN_S2 / ESPN_SWID (expired or wrong); log in to fantasy.espn.com and "
            "copy fresh cookies into .env"
        ) from None
    except ESPNInvalidLeague:
        raise RuntimeError(f"ESPN league {LEAGUE_ID} has no {season} season") from None
    except ESPNUnknownError as e:
        raise RuntimeError(f"ESPN request failed: {e}") from None


# ---- pure transforms: ESPN objects -> table rows ---------------------------------------------------


def settings_row(league, season: int, as_of: datetime) -> dict:
    s = league.settings
    days = sorted(s.waiver_process_days, key=WEEKDAYS.index)
    return {
        "season": season, "espn_league_id": LEAGUE_ID, "league_name": _clean(s.name),
        "num_teams": s.team_count, "regular_season_weeks": s.reg_season_count,
        "playoff_teams": s.playoff_team_count, "scoring_type": s.scoring_type,
        "tie_rule": s.tie_rule, "faab_budget": s.acquisition_budget, "faab_min_bid": s.minimum_bid,
        "acquisition_limit": int(s.acquisition_limit), "waiver_process_days": days,
        "waiver_process_hour": s.waiver_process_hour, "trade_deadline": _ts(s.trade_deadline),
        "veto_votes_required": s.veto_votes_required,
        "roster_slots": {k: v for k, v in s.position_slot_counts.items() if k and v},
        "as_of": as_of,
    }


def scoring_rows(league, season: int) -> list[dict]:
    rows = []
    for r in league.settings.scoring_format:
        if r["abbr"] == "Unknown":
            raise ValueError(f"ESPN scoring stat id {r['id']} has no known name; update espn_api")
        rows.append({"season": season, "abbr": r["abbr"], "stat": r["label"],
                     "points": _r2(r["points"])})
    return rows


def _owner(t) -> str:
    names = [" ".join(p for p in (_clean(o.get("firstName", "")), _clean(o.get("lastName", ""))) if p)
             or o.get("displayName", "") for o in t.owners]
    return " / ".join(n for n in names if n)


def team_rows(league, season: int, as_of: datetime) -> list[dict]:
    budget = league.settings.acquisition_budget
    return [{
        "season": season, "espn_team_id": t.team_id, "team": _clean(t.team_name),
        "abbrev": _clean(t.team_abbrev), "owner": _owner(t),
        "faab_spent": t.acquisition_budget_spent, "faab_remaining": budget - t.acquisition_budget_spent,
        "acquisitions": t.acquisitions, "drops": t.drops, "trades": t.trades, "as_of": as_of,
    } for t in league.teams]


def starters_projection(lineup: list) -> float:
    """Sum of the starters' ESPN projections. Box-level `projected` is live-adjusted (it converges on
    the actual score as games finish), so it cannot serve as the pre-game projection."""
    return sum(p.projected_points for p in lineup if p.slot_position not in ("BE", "IR"))


def box_sides(box):
    """Both sides of a box score as (team, score, projected, lineup, opponent)."""
    h = (box.home_team, box.home_score, starters_projection(box.home_lineup), box.home_lineup)
    a = (box.away_team, box.away_score, starters_projection(box.away_lineup), box.away_lineup)
    for side, other in ((h, a), (a, h)):
        for t in (side[0], other[0]):
            if not hasattr(t, "team_id"):
                raise ValueError("ESPN box score has a bye or empty side; cannot record the matchup")
        yield (*side, other[0])


def weekly_and_player_rows(boxes: list, season: int, week: int, is_final: bool, now: datetime):
    weekly, players = [], []
    for box in boxes:
        for team, score, proj, lineup, opp in box_sides(box):
            weekly.append({
                "season": season, "week": week, "team": _clean(team.team_name),
                "opp_team": _clean(opp.team_name), "proj_pts": _r2(proj), "actual_pts": _r2(score),
                "is_final": is_final, "recorded_at": now, "espn_team_id": team.team_id,
                "opp_espn_team_id": opp.team_id,
            })
            for p in lineup:
                players.append({
                    "season": season, "week": week, "espn_team_id": team.team_id, "player": p.name,
                    "position": p.position, "nfl_team": p.proTeam,
                    "opponent": None if p.pro_opponent in (None, "None") else p.pro_opponent,
                    "slot": p.slot_position, "proj_pts": _r2(p.projected_points),
                    "actual_pts": _r2(p.points), "status_at_pull": p.injuryStatus, "pulled_at": now,
                })
    return weekly, players


def roster_rows(league, season: int, week: int, now: datetime) -> list[dict]:
    return [{
        "season": season, "week": week, "espn_team_id": t.team_id, "player": p.name,
        "position": p.position, "nfl_team": p.proTeam, "slot": p.lineupSlot,
        "status_at_pull": p.injuryStatus, "season_pts": _r2(p.total_points),
        "season_proj": _r2(p.projected_total_points), "pulled_at": now,
    } for t in league.teams for p in t.roster]


def snapshot_rows(league, season: int, week: int, now: datetime) -> list[dict]:
    """Every rostered player's status at this pull, one stamp for the whole set."""
    return [{"season": r["season"], "week": r["week"], "espn_team_id": r["espn_team_id"],
             "player": r["player"], "pulled_at": now, "position": r["position"],
             "nfl_team": r["nfl_team"], "slot": r["slot"], "status": r["status_at_pull"]}
            for r in roster_rows(league, season, week, now)]


def _waiver_at(status: str, ms: float | None) -> datetime | None:
    """UTC instant. A free agent has no process date, even if ESPN sent one."""
    if status != "WAIVERS" or not ms:
        return None
    return datetime.fromtimestamp(ms / 1000, UTC)


def _tag_available(box, entry: dict):
    """Keep the pool-entry status. BoxPlayer drops it."""
    status = entry.get("status")
    name = getattr(box, "name", None) or entry.get("id")
    if status not in POOL_STATUSES:
        raise ValueError(
            f"ESPN available player {name} has no waiver or free-agent status; nothing was written")
    box.availability = status
    box.waiver_process_ms = entry.get("waiverProcessDate")
    return box


def available_rows(players, season: int, week: int, now: datetime) -> list[dict]:
    """One row per available player. Missing status or a repeated id fails the pull."""
    rows = []
    seen: set[int] = set()
    for p in players:
        status = getattr(p, "availability", None)
        if status not in POOL_STATUSES:
            raise ValueError(
                f"ESPN available player {getattr(p, 'name', '?')} has no waiver or free-agent status; "
                "nothing was written")
        pid = int(p.playerId)
        if pid in seen:
            raise ValueError(f"ESPN available pool lists player {pid} twice; nothing was written")
        seen.add(pid)
        owned = getattr(p, "percent_owned", None)
        if owned is not None and float(owned) < 0:
            owned = None
        injury = getattr(p, "injuryStatus", None) or None
        rows.append({
            "season": season, "week": week, "espn_player_id": pid, "player": _clean(p.name),
            "position": getattr(p, "position", None) or None, "nfl_team": getattr(p, "proTeam", None),
            "injury_status": injury, "percent_owned": _r2(owned), "on_bye": bool(p.on_bye_week),
            "availability": status, "waiver_at": _waiver_at(status, getattr(p, "waiver_process_ms", None)),
            "pulled_at": now,
            "season_pts": _r2(getattr(p, "total_points", None)),
            "season_proj": _r2(getattr(p, "projected_total_points", None)),
        })
    return rows


def fetch_available(league, week: int) -> list:
    """One player-pool request (limit 200). A second call loads the pro schedule so bye weeks are real.

    League.free_agents() builds BoxPlayer and drops the entry status, so this reads the raw entry.
    """
    import json

    from espn_api.football.box_player import BoxPlayer

    filters = {"players": {
        "filterStatus": {"value": list(POOL_STATUSES)},
        "limit": POOL_LIMIT,
        "sortPercOwned": {"sortPriority": 1, "sortAsc": False},
    }}
    data = league.espn_request.league_get(
        params={"view": "kona_player_info", "scoringPeriodId": week},
        headers={"x-fantasy-filter": json.dumps(filters)})
    entries = data.get("players") if isinstance(data, dict) else None
    if entries is None:
        raise ValueError("ESPN available pool has no players list; nothing was written")
    schedule = league._get_pro_schedule(week)
    return [_tag_available(BoxPlayer(entry, schedule, {}, week, league.year), entry) for entry in entries]


def append_snapshots(rows: list[dict]) -> int:
    """Insert only: never upsert, replace, or delete (the table's trigger would reject it anyway)."""
    from ..db import insert

    if not rows:
        raise ValueError("ESPN returned no rostered players; no status snapshot was written")
    return insert(_frame("fantasy.loc_status_snapshots", rows), "fantasy.loc_status_snapshots")


def run_snapshot(season: int, league=None, now: datetime | None = None) -> dict:
    """`--snapshot-only`: append the current roster statuses and replace the available pool.

    Both fetches finish before either write. An empty roster or an empty pool writes nothing.
    """
    from espn_api.requests.espn_requests import (
        ESPNAccessDenied,
        ESPNInvalidLeague,
        ESPNUnknownError,
    )

    from ..db import replace_scope

    league = league or connect(season)
    now = now or datetime.now(UTC)
    week = league.current_week
    try:
        rows = snapshot_rows(league, season, week, now)
        available = available_rows(fetch_available(league, week), season, week, now) if rows else []
    except (ESPNAccessDenied, ESPNInvalidLeague, ESPNUnknownError) as e:
        raise RuntimeError(f"ESPN request failed ({type(e).__name__}); nothing was written") from None
    if not rows:
        raise ValueError("ESPN returned no rostered players; no status snapshot was written")
    if not available:
        raise ValueError("ESPN returned no available players; nothing was written")
    replaced = replace_scope(
        _frame("fantasy.loc_available", available), "fantasy.loc_available", "season = %s", (season,))
    return {"season": season, "week": week, "pulled_at": now,
            "inserted": append_snapshots(rows), "available": replaced}


def _item(season, week, ts, team_id, typ, status, bid, item_type, player, group_key, note=None):
    return {"season": season, "week": week, "espn_ts": ts, "espn_team_id": team_id,
            "txn_type": typ, "status": status, "bid": bid, "item_type": item_type,
            "player": player, "group_key": group_key, "note": note}


def raw_transaction_rows(raw: list[dict], season: int, name_of) -> list[dict]:
    """ESPN mTransactions2 rows -> one row per ADD/DROP item, failed and canceled bids included.

    ROSTER transactions carry lineup moves; only their DROP items (a drop with no add) are kept.
    """
    rows = []
    for t in raw:
        typ = t["type"]
        if typ not in TXN_TYPES:
            continue
        if not t.get("status"):
            raise ValueError(f"ESPN transaction {t.get('id')} ({typ}) has no status")
        drop_only = typ == "ROSTER"
        for it in t.get("items") or []:
            if it["type"] not in ("ADD", "DROP") or (drop_only and it["type"] != "DROP"):
                continue
            rows.append(_item(
                season, t.get("scoringPeriodId"), _ts(t.get("processDate") or t.get("proposedDate")),
                t["teamId"], "FREEAGENT" if drop_only else ("WAIVER" if typ == "WAIVER_ERROR" else typ),
                t["status"], t.get("bidAmount") if typ in ("WAIVER", "WAIVER_ERROR") else None,
                it["type"], name_of(it["playerId"]), t["id"],
                "drop without add" if drop_only else None,
            ))
    return rows


def draft_rows(picks: list, season: int) -> list[dict]:
    return [_item(season, 0, None, p.team.team_id, "DRAFT", "EXECUTED", p.bid_amount or None,
                  "DRAFTED", p.playerName, f"draft-r{p.round_num}-p{p.round_pick}") for p in picks]


def trade_rows(activities: list, season: int, name_of) -> list[dict]:
    """Executed trades from the activity feed: a TRADE_SENT and TRADE_RECEIVED row per player.

    One feed topic is one executed trade; its timestamp keys the group.
    """
    rows = []
    for a in activities:
        for team, action, player, _bid in a.actions:
            if action not in ("TRADE_SENT", "TRADE_RECEIVED"):
                continue
            if not hasattr(team, "team_id"):
                raise ValueError(f"ESPN trade at {a.date} has a leg with no team; cannot record it")
            name = getattr(player, "name", None) or name_of(int(player))
            rows.append(_item(season, None, _ts(a.date), team.team_id, "TRADE", "EXECUTED", None,
                              action, name, f"trade-{a.date}"))
    return rows


def trade_groups(rows: list[dict]) -> int:
    return len({r["group_key"] for r in rows if r["txn_type"] == "TRADE"})


# ---- ESPN fetch --------------------------------------------------------------------------------------


def fetch_raw_transactions(league, last_week: int) -> list[dict]:
    """Every FA/waiver/roster transaction ESPN lists for scoring periods 0..last_week, de-duplicated."""
    import json

    seen: dict[str, dict] = {}
    flt = {"transactions": {"filterType": {"value": list(TXN_TYPES)}}}
    for w in range(last_week + 1):
        data = league.espn_request.league_get(
            params={"view": "mTransactions2", "scoringPeriodId": w},
            headers={"x-fantasy-filter": json.dumps(flt)})
        for t in data.get("transactions", []):
            seen[t["id"]] = t
    return list(seen.values())


def fetch_trades(league, size: int = 50) -> list:
    out, offset = [], 0
    while True:
        page = league.recent_activity(size=size, msg_type="TRADED", offset=offset)
        out += page
        if len(page) < size:
            return out
        offset += size


def player_namer(league):
    cache: dict[int, str] = {}

    def name_of(pid: int) -> str:
        if pid not in cache:
            name = league.player_map.get(pid)
            if not name:
                card = league.player_info(playerId=pid)
                name = getattr(card, "name", None)
            if not name:
                raise ValueError(f"ESPN player id {pid} has no name; cannot record the transaction")
            cache[pid] = name
        return cache[pid]

    return name_of


# ---- DB ----------------------------------------------------------------------------------------------


def week_finality(season: int, weeks: list[int]) -> dict[int, list[str]]:
    """{week: games without a result}. Empty list = every REG game that week is complete."""
    from ..db import read_sql

    df = read_sql(
        "select week, game_id, result is null as no_result from raw.schedules "
        "where season = %s and game_type = 'REG' and week = any(%s) order by week, game_id",
        (season, weeks))
    out: dict[int, list[str]] = {}
    for w in weeks:
        games = df.filter(pl.col("week") == w) if not df.is_empty() else df
        if games.is_empty():
            raise ValueError(f"no REG games in raw.schedules for {season} week {w}; "
                             "run `nfl-edge ingest` first")
        out[w] = games.filter(pl.col("no_result"))["game_id"].to_list()
    return out


def check_team_names(season: int, espn_names: set[str]) -> None:
    """loc_weekly_scores is keyed on the team name; a renamed team would orphan its old rows."""
    from ..db import read_sql

    df = read_sql("select distinct team from fantasy.loc_weekly_scores where season = %s", (season,))
    stale = sorted(set(df["team"].to_list()) - espn_names) if not df.is_empty() else []
    if stale:
        raise ValueError(
            "loc_weekly_scores has team names ESPN no longer uses: " + ", ".join(stale)
            + ". Rename those rows first; nothing was written")


def _write(table: str, df: pl.DataFrame, season: int, weeks: list[int] | None = None,
           replace: bool = False) -> dict:
    from ..db import read_sql, replace_scope, upsert

    keys = KEYS[table]
    where, params = "season = %s", [season]
    if weeks:
        where, params = where + " and week = any(%s)", params + [weeks]
    old = read_sql(f"select {', '.join(keys)} from {table} where {where}", tuple(params))
    old_keys = set(old.select(keys).rows()) if not old.is_empty() else set()
    new_keys = set(df.select(keys).rows())
    if len(new_keys) != df.height:
        raise ValueError(f"{table}: duplicate {', '.join(keys)} in the ESPN data; nothing was written")
    if replace:
        replace_scope(df, table, where, tuple(params))
    else:
        upsert(df, table, keys)
    return {"inserted": len(new_keys - old_keys), "updated": len(new_keys & old_keys),
            "removed": len(old_keys - new_keys) if replace else 0}


def _write_luck(season: int, now: datetime) -> dict:
    """Refit and replace the season's luck rows from every stored weekly score."""
    from ..db import read_sql
    from .espn_luck import compute_luck

    weekly = read_sql("select season, week, espn_team_id, opp_espn_team_id, proj_pts::float8 as proj_pts, "
                      "actual_pts::float8 as actual_pts, is_final from fantasy.loc_weekly_scores "
                      "where season = %s", (season,))
    return _write("fantasy.loc_luck", compute_luck(weekly, now), season, replace=True)


# ---- entry point -------------------------------------------------------------------------------------


def run(season: int, week: int | None = None, league=None) -> dict:
    """One pull. No `week`: every week 1..current; `week`: that week only. League-level tables always."""
    from espn_api.requests.espn_requests import (
        ESPNAccessDenied,
        ESPNInvalidLeague,
        ESPNUnknownError,
    )

    league = league or connect(season)
    current = league.current_week
    if week is not None and not 1 <= week <= current:
        raise ValueError(f"week {week} is outside 1..{current} (ESPN's current week); nothing to load")
    weeks = [week] if week else list(range(1, current + 1))
    now = datetime.now(UTC)

    try:
        teams = team_rows(league, season, now)
        check_team_names(season, {t["team"] for t in teams})
        open_games = week_finality(season, weeks)
        weekly, players = [], []
        for w in weeks:
            wk, pl_rows = weekly_and_player_rows(league.box_scores(w), season, w, not open_games[w], now)
            weekly += wk
            players += pl_rows
        rosters = roster_rows(league, season, current, now) if current in weeks else []
        snapshots = snapshot_rows(league, season, current, now)
        available = available_rows(fetch_available(league, current), season, current, now)
        if not available:
            raise ValueError("ESPN returned no available players; nothing was written")
        name_of = player_namer(league)
        trades = trade_rows(fetch_trades(league), season, name_of)
        counter_trades = sum(t["trades"] for t in teams)
        if trade_groups(trades) * 2 != counter_trades:
            raise ValueError(
                f"ESPN activity feed lists {trade_groups(trades)} executed trades but the team "
                f"counters add up to {counter_trades // 2}; nothing was written")
        txns = (draft_rows(league.draft, season)
                + raw_transaction_rows(fetch_raw_transactions(league, current), season, name_of)
                + trades)
    except (ESPNAccessDenied, ESPNInvalidLeague, ESPNUnknownError) as e:
        raise RuntimeError(f"ESPN request failed ({type(e).__name__}); nothing was written") from None

    scoped = {"weeks": weeks}
    tables = {
        "fantasy.loc_league_settings": (_frame("fantasy.loc_league_settings",
                                               [settings_row(league, season, now)]), {}),
        "fantasy.loc_scoring_rules": (_frame("fantasy.loc_scoring_rules",
                                             scoring_rows(league, season)), {}),
        "fantasy.loc_teams": (_frame("fantasy.loc_teams", teams), {}),
        "fantasy.loc_weekly_scores": (_frame("fantasy.loc_weekly_scores", weekly), {}),
        "fantasy.loc_player_week_scores": (_frame("fantasy.loc_player_week_scores", players),
                                           {**scoped, "replace": True}),
        "fantasy.loc_transactions": (_frame("fantasy.loc_transactions", txns), {"replace": True}),
    }
    if rosters:
        tables["fantasy.loc_rosters"] = (_frame("fantasy.loc_rosters", rosters),
                                         {"weeks": [current], "replace": True})
    summary = {t.removeprefix("fantasy."): _write(t, df, season, **kw) for t, (df, kw) in tables.items()}
    summary["loc_luck"] = _write_luck(season, now)
    summary["loc_status_snapshots"] = {"inserted": append_snapshots(snapshots), "updated": 0, "removed": 0}
    summary["loc_available"] = _write(
        "fantasy.loc_available", _frame("fantasy.loc_available", available), season, replace=True)
    return {"season": season, "weeks": weeks, "tables": summary,
            "not_final": {w: g for w, g in open_games.items() if g},
            "rosters_skipped": not rosters}
