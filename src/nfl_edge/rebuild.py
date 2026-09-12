"""Weekend rebuild helpers. Week comes from raw.schedules, not a plist."""
from __future__ import annotations

import fcntl
import os
import shutil
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from .config import ROOT
from .db import execute, read_sql

DRAWS_ROOT = ROOT / "data" / "draws"
AGE_WEEKS = 2
AGE_DAYS = 14


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


def newest_run(season: int, week: int) -> tuple[str, int, int] | None:
    df = read_sql(
        "select r.run_id::text as run_id, "
        "(select count(*)::int from model.proj_games p where p.run_id = r.run_id) as n_games, "
        "(select count(distinct game_id)::int from model.proj_players p "
        "  where p.run_id = r.run_id and p.position is distinct from 'DST') as n_player_games "
        "from model.sim_runs r where r.season = %s and r.week = %s "
        "order by r.created_at desc limit 1",
        (season, week),
    )
    if df.is_empty():
        return None
    row = df.to_dicts()[0]
    return str(row["run_id"]), int(row["n_games"]), int(row["n_player_games"] or 0)


def slate_games(season: int, week: int) -> int:
    df = read_sql(
        "select count(*)::int as n from raw.schedules "
        "where season = %s and week = %s and game_type = 'REG'",
        (season, week),
    )
    if df.is_empty():
        return 0
    return int(df.to_dicts()[0]["n"])


def drop_incomplete(season: int, week: int, after: datetime) -> int:
    """Delete runs created after `after` whose game or player-game count ≠ the week's slate."""
    n = slate_games(season, week)
    if after.tzinfo is None:
        after = after.replace(tzinfo=UTC)
    return execute(
        "delete from model.sim_runs r where r.season = %s and r.week = %s "
        "and r.created_at > %s "
        "and ("
        "  (select count(*) from model.proj_games p where p.run_id = r.run_id) <> %s"
        "  or (select count(distinct game_id) from model.proj_players p "
        "      where p.run_id = r.run_id and p.position is distinct from 'DST') <> %s"
        ")",
        (season, week, after, n, n),
    )


@contextmanager
def sim_lock(season: int, week: int, root: Path | None = None):
    """Exclusive non-blocking lock for one season/week. Kernel drops it if the process dies."""
    lock_dir = (root or DRAWS_ROOT) / str(season) / str(week)
    lock_dir.mkdir(parents=True, exist_ok=True)
    path = lock_dir / ".sim.lock"
    fd = os.open(path, os.O_CREAT | os.O_RDWR)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        raise RuntimeError(f"sim already running for {season} week {week}") from None
    try:
        yield
    finally:
        fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


# ----------------------------------------------------------------------------- prune-draws

def week_gate(
    ungraded: list[str],
    *,
    current: int | None,
    week: int,
    last_gameday: date | None,
    today: date,
) -> tuple[str, str]:
    """('ready'|'skip'|'age', reason). Age fallback: current-week >= 2, or last gameday + 14d."""
    if not ungraded:
        return "ready", "fully graded"
    games = ", ".join(ungraded)
    aged = current is not None and current - week >= AGE_WEEKS
    if not aged and current is None and last_gameday is not None:
        aged = (today - last_gameday).days >= AGE_DAYS
    if aged:
        return "age", f"age fallback, still ungraded {games}"
    return "skip", f"waiting on grades for {games}"


def plan_week_runs(
    run_ids_newest_first: list[str],
    results_ids: set[str],
    disk_ids: list[str],
) -> list[tuple[str, str]]:
    """(run_id, action) with action in keep_newest / keep_results / prune / orphan."""
    newest = run_ids_newest_first[0] if run_ids_newest_first else None
    known = set(run_ids_newest_first)
    out: list[tuple[str, str]] = []
    for rid in run_ids_newest_first:
        if rid == newest:
            out.append((rid, "keep_newest"))
        elif rid in results_ids:
            out.append((rid, "keep_results"))
        else:
            out.append((rid, "prune"))
    for rid in disk_ids:
        if rid not in known:
            out.append((rid, "orphan"))
    return out


def _dir_size(path: Path) -> int:
    if not path.is_dir():
        return 0
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def _fmt_size(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}MB"
    if n >= 1000:
        return f"{n / 1000:.1f}KB"
    return f"{n}B"


def _ungraded_games(season: int, week: int) -> list[str]:
    df = read_sql(
        """
        select s.game_id
        from raw.schedules s
        where s.season = %s and s.week = %s and s.game_type = 'REG'
          and not exists (
            select 1 from model.results r
            join model.sim_runs sr on sr.run_id = r.run_id
            where sr.season = s.season and sr.week = s.week and r.ref_id = s.game_id
          )
        order by s.game_id
        """,
        (season, week),
    )
    if df.is_empty():
        return []
    return [str(r["game_id"]) for r in df.to_dicts()]


def _last_gameday(season: int, week: int) -> date | None:
    df = read_sql(
        "select max(gameday)::date as d from raw.schedules "
        "where season = %s and week = %s and game_type = 'REG'",
        (season, week),
    )
    if df.is_empty() or df.to_dicts()[0]["d"] is None:
        return None
    return df.to_dicts()[0]["d"]


def _weeks(season: int | None, week: int | None) -> list[tuple[int, int]]:
    found: set[tuple[int, int]] = set()
    if DRAWS_ROOT.is_dir():
        for sdir in DRAWS_ROOT.iterdir():
            if not sdir.is_dir() or not sdir.name.isdigit():
                continue
            for wdir in sdir.iterdir():
                if wdir.is_dir() and wdir.name.isdigit():
                    found.add((int(sdir.name), int(wdir.name)))
    df = read_sql("select distinct season, week from model.sim_runs")
    if not df.is_empty():
        for r in df.to_dicts():
            found.add((int(r["season"]), int(r["week"])))
    rows = sorted(found)
    if season is not None:
        rows = [rw for rw in rows if rw[0] == season]
    if week is not None:
        rows = [rw for rw in rows if rw[1] == week]
    return rows


@dataclass
class PruneLine:
    text: str
    action: str
    season: int
    week: int
    run_id: str | None = None
    path: Path | None = None
    size: int = 0


def prune_draws(
    season: int | None = None,
    week: int | None = None,
    dry_run: bool = False,
    today: date | None = None,
) -> list[str]:
    """Delete extra parquet after a week is graded (or age-falls back). Never delete sim_runs."""
    today = today or datetime.now(tz=UTC).date()
    lines: list[PruneLine] = []
    current_by_season: dict[int, int | None] = {}
    for s, w in _weeks(season, week):
        if s not in current_by_season:
            current_by_season[s] = current_week(s, today)
        ungraded = _ungraded_games(s, w)
        gate, reason = week_gate(
            ungraded, current=current_by_season[s], week=w,
            last_gameday=_last_gameday(s, w), today=today,
        )
        if gate == "skip":
            lines.append(PruneLine(f"skip {s} week {w}: {reason}", "skip", s, w))
            continue
        if gate == "age":
            lines.append(PruneLine(f"{s} week {w}: {reason}", "age", s, w))
        runs = read_sql(
            "select run_id::text as run_id from model.sim_runs "
            "where season = %s and week = %s order by created_at desc",
            (s, w),
        )
        run_ids = [] if runs.is_empty() else [str(r["run_id"]) for r in runs.to_dicts()]
        res = read_sql(
            "select distinct r.run_id::text as run_id from model.results r "
            "join model.sim_runs sr on sr.run_id = r.run_id "
            "where sr.season = %s and sr.week = %s",
            (s, w),
        )
        results_ids = set() if res.is_empty() else {str(r["run_id"]) for r in res.to_dicts()}
        wdir = DRAWS_ROOT / str(s) / str(w)
        disk_ids = [
            p.name for p in wdir.iterdir()
            if p.is_dir() and not p.name.startswith(".")
        ] if wdir.is_dir() else []
        for rid, action in plan_week_runs(run_ids, results_ids, disk_ids):
            path = wdir / rid
            size = _dir_size(path)
            label = {
                "keep_newest": "keep newest",
                "keep_results": "keep results",
                "prune": "prune parquet",
                "orphan": "orphan dir",
            }[action]
            rel = path.relative_to(ROOT) if path.exists() else path
            lines.append(PruneLine(
                f"{label} {rel} {_fmt_size(size)}", action, s, w, rid, path, size,
            ))
            if dry_run or action in ("keep_newest", "keep_results"):
                continue
            if action == "prune":
                execute("update model.proj_games set draws_path = null where run_id = %s", (rid,))
                execute("update model.proj_players set draws_path = null where run_id = %s", (rid,))
            if path.is_dir():
                shutil.rmtree(path)
    return [ln.text for ln in lines]
