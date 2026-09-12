"""Weekend rebuild helpers. Week comes from raw.schedules, not a plist."""
from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

from .db import execute, read_sql


def week_from_gamedays(rows: list[tuple[int, date]], today: date) -> int | None:
    """REG week whose games span today. Saturday before Sunday still matches."""
    by_week: dict[int, list[date]] = {}
    for week, gameday in rows:
        if gameday is None:
            continue
        by_week.setdefault(int(week), []).append(gameday)
    hits = [
        week
        for week, days in by_week.items()
        if min(days) <= today + timedelta(days=1) and max(days) >= today
    ]
    return min(hits) if hits else None


def current_week(season: int, today: date | None = None) -> int | None:
    df = read_sql(
        "select week, gameday::date as gameday from raw.schedules "
        "where season = %s and game_type = 'REG'",
        (season,),
    )
    if df.is_empty():
        return None
    rows = [(int(r["week"]), r["gameday"]) for r in df.to_dicts()]
    return week_from_gamedays(rows, today or datetime.now(tz=UTC).date())


def newest_run(season: int, week: int) -> tuple[str, int] | None:
    df = read_sql(
        "select r.run_id::text as run_id, "
        "(select count(*)::int from model.proj_games p where p.run_id = r.run_id) as n_games "
        "from model.sim_runs r where r.season = %s and r.week = %s "
        "order by r.created_at desc limit 1",
        (season, week),
    )
    if df.is_empty():
        return None
    row = df.to_dicts()[0]
    return str(row["run_id"]), int(row["n_games"])


def slate_games(season: int, week: int) -> int:
    df = read_sql(
        "select count(*)::int as n from raw.schedules where season = %s and week = %s",
        (season, week),
    )
    if df.is_empty():
        return 0
    return int(df.to_dicts()[0]["n"])


def drop_incomplete(season: int, week: int, after: datetime) -> int:
    """Delete runs created after `after` whose proj_games count ≠ the week's slate."""
    n = slate_games(season, week)
    if after.tzinfo is None:
        after = after.replace(tzinfo=UTC)
    return execute(
        "delete from model.sim_runs r where r.season = %s and r.week = %s "
        "and r.created_at > %s "
        "and (select count(*) from model.proj_games p where p.run_id = r.run_id) <> %s",
        (season, week, after, n),
    )
