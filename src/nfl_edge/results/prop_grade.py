"""Grade model.prop_edges against player_stats_weekly. Skip when scores are unpublished."""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from ..db import execute, read_sql
from ..market.edge import decimal_odds
from .dfs_grade import scores_published

ET = ZoneInfo("America/New_York")

WEEKLY = {
    "pass_yds": "passing_yards",
    "rush_yds": "rushing_yards",
    "rec_yds": "receiving_yards",
    "rec": "receptions",
    "pass_td": "passing_tds",
}


def skip_unpublished(season: int, week: int) -> dict:
    return {"skipped": True, "reason": "scores unpublished", "season": season, "week": week, "n_rows": 0}


def actual_stat(stats: dict | None, stat: str) -> float | None:
    raw = stats or {}
    if stat == "anytime_td":
        a = raw.get("rushing_tds")
        b = raw.get("receiving_tds")
        if a is None and b is None:
            return None
        return float(a or 0) + float(b or 0)
    key = WEEKLY.get(stat)
    if not key:
        return None
    v = raw.get(key)
    return None if v is None else float(v)


def prop_outcome(side: str, line: float, actual: float) -> int | None:
    line, actual = float(line), float(actual)
    if actual == line:
        return None
    won_over = actual > line
    if side == "over":
        return 1 if won_over else 0
    return 0 if won_over else 1


def _pnl(outcome: int | None, price: int | None) -> float | None:
    if outcome is None or price is None:
        return 0.0 if outcome is None else None
    if outcome == 1:
        return float(decimal_odds(price) - 1.0)
    return -1.0


def _weekly_count(season: int, week: int) -> int:
    df = read_sql(
        "select count(*)::int as n from raw.player_stats_weekly where season = %s and week = %s",
        (season, week),
    )
    if df.is_empty():
        return 0
    return int(df[0, "n"] or 0)


def run(season: int, week: int, run_id: str | None = None) -> dict:
    if not scores_published(_weekly_count(season, week)):
        return skip_unpublished(season, week)
    params: tuple
    if run_id:
        sql = """
            select e.run_id::text, e.market_prop_id, e.player_id, e.stat, e.line::float8 as line,
                   e.side, e.price, mp.season, mp.week
            from model.prop_edges e
            join model.market_props mp on mp.id = e.market_prop_id
            where e.run_id = %s
        """
        params = (run_id,)
    else:
        sql = """
            select e.run_id::text, e.market_prop_id, e.player_id, e.stat, e.line::float8 as line,
                   e.side, e.price, mp.season, mp.week
            from model.prop_edges e
            join model.sim_runs r on r.run_id = e.run_id
            join model.market_props mp on mp.id = e.market_prop_id
            where r.season = %s and r.week = %s
        """
        params = (season, week)
    edges = read_sql(sql, params)
    if edges.is_empty():
        return {"skipped": False, "reason": None, "season": season, "week": week, "n_rows": 0}
    pids = edges["player_id"].unique().to_list()
    weekly = read_sql(
        "select player_id, stats from raw.player_stats_weekly "
        "where season = %s and week = %s and player_id = any(%s)",
        (season, week, pids),
    )
    by_pid = {r["player_id"]: r.get("stats") or {} for r in weekly.to_dicts()}
    now = datetime.now(ET)
    n = 0
    for row in edges.to_dicts():
        actual = actual_stat(by_pid.get(row["player_id"]), row["stat"])
        if actual is None:
            continue
        oc = prop_outcome(row["side"], float(row["line"]), actual)
        pn = _pnl(oc, row.get("price"))
        execute(
            """
            update model.prop_edges
            set actual = %s, outcome = %s, pnl = %s, graded_at = %s
            where run_id = %s and market_prop_id = %s and side = %s
            """,
            (actual, oc, pn, now, row["run_id"], row["market_prop_id"], row["side"]),
        )
        n += 1
    return {"skipped": False, "reason": None, "season": season, "week": week, "n_rows": n}
