"""The week's phases as one registry: Ingest → Salaries → Sim → Lines → Props → DFS → Grade.

Each phase is a list of existing `nfl-edge` commands. `run_phase` runs them in order and writes
one ops.workflow_runs row (running, then success or failed). The /workflow page and the GitHub
Actions jobs both go through here; ops/week-rebuild.sh did the same by hand.

Rules carried over from week-rebuild.sh: no salary file means stop with the file name expected;
a sim that fails or comes back short never stays the newest run (drop_incomplete); a soft step
(odds pull, FantasyPros) logs and the phase continues. Not carried over: the Sunday 08:50 cutoff.
"""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Protocol

from . import rebuild
from .config import DATA_DIR
from .ingest import dk_salaries as dk

PHASES = ("ingest", "salaries", "sim", "lines", "props", "dfs", "grade")


class PhaseFailed(RuntimeError):
    """A phase stopped. The message is the plain-language reason shown on /workflow."""


class StepFailed(RuntimeError):
    def __init__(self, args: list[str], output: str):
        self.args_ = list(args)
        self.output = output
        super().__init__(output)


@dataclass(frozen=True)
class Context:
    season: int
    week: int
    slate: str | None = None
    draws: int | None = None
    field_size: int | None = None
    iterations: int | None = None
    full_field: bool = False

    def sw(self) -> list[str]:
        return ["--season", str(self.season), "--week", str(self.week)]

    def settings(self) -> dict:
        return {"draws": self.draws, "field_size": self.field_size,
                "iterations": self.iterations, "full_field": self.full_field}


Runner = Callable[[list[str]], str]


@dataclass(frozen=True)
class Step:
    args: tuple[str, ...] = ()
    soft: bool = False
    fn: Callable[[Context, Runner], str | None] | None = field(default=None, compare=False)


def _step(*args: str, soft: bool = False) -> Step:
    return Step(args=tuple(args), soft=soft)


# --- plans --------------------------------------------------------------------------------


def week_slates(season: int, week: int) -> list[str]:
    return [slate for slate, _, _ in dk.week_dk_csvs(season, week)]


def status_authority(season: int, week: int) -> str | None:
    """`full` when present, else the salary file with the most rows (the widest slate)."""
    files = dk.week_dk_csvs(season, week)
    if not files:
        return None
    names = [s for s, _, _ in files]
    if "full" in names:
        return "full"

    def rows(path) -> int:
        with open(path, encoding="utf-8-sig") as f:
            return sum(1 for _ in f)

    return max(files, key=lambda f: (rows(f[1]), f[0]))[0]


def _salaries(ctx: Context) -> list[Step]:
    slates = week_slates(ctx.season, ctx.week)
    if not slates:
        raise PhaseFailed(
            f"no DK salary files for {ctx.season} week {ctx.week}; "
            f"`nfl-edge dk-fetch --week {ctx.week}` found none in the DK lobby"
        )
    steps = [_step("dk-salaries", *ctx.sw(), "--slate", s, "--salaries-only") for s in slates]
    steps.append(_step("dk-salaries", *ctx.sw(), "--merge-status",
                       "--status-from", status_authority(ctx.season, ctx.week) or slates[0]))
    overrides = DATA_DIR / "overrides" / f"{ctx.season}_wk{ctx.week:02d}.csv"
    if overrides.exists():
        steps.append(_step("overrides", *ctx.sw(), "--file", str(overrides)))
    steps.append(_step("ingest", "fantasypros-status", *ctx.sw(), soft=True))
    return steps


def _sim_step(ctx: Context, run: Runner) -> str:
    """Sim, then require every game with player draws; otherwise drop what this run left."""
    started = datetime.now(UTC)
    args = ["sim", *ctx.sw()]
    if ctx.draws:
        args += ["--draws", str(ctx.draws)]
    args += ["--note", "workflow"]
    try:
        run(args)
        newest = rebuild.newest_run(ctx.season, ctx.week)
        expected = rebuild.slate_games(ctx.season, ctx.week)
        if newest is None:
            raise PhaseFailed(f"sim wrote no run for {ctx.season} week {ctx.week}")
        run_id, n_games, n_players = newest
        if n_games != expected or n_players != expected:
            raise PhaseFailed(
                f"sim covered {min(n_games, n_players)} of {expected} games "
                f"(games {n_games}, games with player draws {n_players}); the run was removed"
            )
    except StepFailed as e:
        if "already running" in e.output:
            raise PhaseFailed(f"another sim for week {ctx.week} is running; try again after it")
        rebuild.drop_incomplete(ctx.season, ctx.week, started)
        raise
    except PhaseFailed:
        rebuild.drop_incomplete(ctx.season, ctx.week, started)
        raise
    return run_id


def _props(ctx: Context) -> list[Step]:
    args = ["props", *ctx.sw()]
    f = DATA_DIR / "props" / f"props_{ctx.season}_wk{ctx.week:02d}.csv"
    if f.exists():
        args += ["--file", str(f)]
    return [_step(*args)]


def _dfs(ctx: Context) -> list[Step]:
    if not ctx.slate:
        raise PhaseFailed("DFS runs one salary file; pick its slate")
    args = ["dfs", *ctx.sw(), "--site", "dk", "--slate", ctx.slate]
    if ctx.iterations:
        args += ["--iterations", str(ctx.iterations)]
    if ctx.field_size:
        args += ["--field-size", str(ctx.field_size)]
    if ctx.full_field:
        args.append("--full-field")
    # Load this slate's salary rows first (idempotent), so a file uploaded on /workflow can go
    # straight to DFS without a Salaries run in between.
    load = _step("dk-salaries", *ctx.sw(), "--slate", ctx.slate, "--salaries-only")
    return [load, _step(*args)]


def plan(phase: str, ctx: Context) -> list[Step]:
    if phase == "ingest":
        return [_step("ingest", *ctx.sw())]
    if phase == "salaries":
        return _salaries(ctx)
    if phase == "sim":
        return [Step(fn=_sim_step)]
    if phase == "lines":
        return [_step("ingest", "odds-api", "--markets", "h2h,spreads,totals", "--regions", "us",
                      soft=True),
                _step("lines", *ctx.sw())]
    if phase == "props":
        return _props(ctx)
    if phase == "dfs":
        return _dfs(ctx)
    if phase == "refresh":
        return _refresh(ctx)
    if phase == "grade":
        return [_step("ingest", *ctx.sw()),
                _step("benchmark", "nflgamesim", *ctx.sw(), "--refresh-actuals", soft=True),
                _step("missing-finals", *ctx.sw()),
                _step("grade", *ctx.sw())]
    raise PhaseFailed(f"unknown phase {phase!r}; choose from {', '.join(PHASES)}, refresh")


def board_week(season: int) -> int | None:
    """The week being played, else the lowest REG week with a game still to play."""
    from .db import read_sql

    week = rebuild.current_week(season)
    if week is not None:
        return week
    df = read_sql(
        "select min(week)::int as w from raw.schedules "
        "where season = %s and game_type = 'REG' and result is null",
        (season,),
    )
    return None if df.is_empty() or df[0, "w"] is None else int(df[0, "w"])


def _each_week(cmd: str, then: Callable[[int], list[list[str]]]) -> Callable:
    """A soft step over the weeks printed by `nfl-edge <cmd> --season S` (one per line)."""

    def fn(ctx: Context, run: Runner) -> None:
        try:
            weeks = [int(w) for w in run([cmd, "--season", str(ctx.season)]).split()
                     if w.strip().isdigit()]
        except StepFailed as e:
            print(f"(soft) {cmd}: {_last_line(e.output)}", flush=True)
            return
        for week in weeks:
            for args in then(week):
                try:
                    run(args)
                except StepFailed as e:
                    print(f"(soft) {' '.join(args)}: {_last_line(e.output)}", flush=True)
                    break
        return

    return fn


def _fetch_and_load_salaries(ctx: Context, run: Runner) -> None:
    """dk-fetch, then load every file it left so the web sees the week's slates."""
    run(["dk-fetch", *ctx.sw()])
    slates = week_slates(ctx.season, ctx.week)
    for s in slates:
        run(["dk-salaries", *ctx.sw(), "--slate", s, "--salaries-only"])
    if slates:
        run(["dk-salaries", *ctx.sw(), "--merge-status",
             "--status-from", status_authority(ctx.season, ctx.week) or slates[0]])


def _refresh(ctx: Context) -> list[Step]:
    """Lines and scores, injuries, DK salary files, full LOC pull, grade, then the change check.

    The LOC step is the full `ingest espn-league` (standings, scores, rosters, transactions),
    which also appends a status snapshot. `--snapshot-only` does not move standings.
    """
    sw = ctx.sw()
    season = ["--season", str(ctx.season)]
    return [
        _step("ingest", "odds-api", "--markets", "h2h,spreads,totals", "--regions", "us",
              soft=True),
        _step("ingest", *season, "--lines-only", soft=True),
        Step(fn=_each_week("stale-weeks", lambda w: [["lines", *season, "--week", str(w)]])),
        Step(fn=_fetch_and_load_salaries, soft=True),
        _step("ingest", "fantasypros-status", *sw, soft=True),
        _step("ingest", "espn-league", *season, soft=True),
        _step("ingest", "live", *sw, soft=True),
        _step("actuals", *sw, soft=True),
        Step(fn=_each_week("ungraded-completed", lambda w: [
            ["missing-finals", *season, "--week", str(w)],
            ["grade", *season, "--week", str(w)],
        ])),
        _step("change-check", *sw),
    ]


def chain(start: str, slates: list[str]) -> list[tuple[str, str | None]]:
    """Phases from `start` through DFS (one per salary file). Grade only runs on its own."""
    if start not in PHASES:
        raise PhaseFailed(f"unknown phase {start!r}; choose from {', '.join(PHASES)}")
    if start == "grade":
        return [("grade", None)]
    out: list[tuple[str, str | None]] = []
    for phase in PHASES[PHASES.index(start):]:
        if phase == "grade":
            break
        if phase == "dfs":
            out += [("dfs", s) for s in slates]
        else:
            out.append((phase, None))
    return out


# --- running ------------------------------------------------------------------------------


def run_cli(args: list[str]) -> str:
    """One `nfl-edge` command in a child process; output echoed and returned."""
    print(f"$ nfl-edge {' '.join(args)}", flush=True)
    proc = subprocess.run([sys.executable, "-m", "nfl_edge", *args], capture_output=True, check=False,
                          text=True)
    out = (proc.stdout or "") + (proc.stderr or "")
    print(out, end="" if out.endswith("\n") or not out else "\n", flush=True)
    if proc.returncode != 0:
        raise StepFailed(args, out.strip() or f"nfl-edge {args[0]} exited {proc.returncode}")
    return out


def _last_line(text: str | None) -> str:
    lines = [ln.strip() for ln in (text or "").splitlines() if ln.strip()]
    return lines[-1][:500] if lines else ""


class Recorder(Protocol):
    def start(self, phase: str, ctx: Context) -> int: ...

    def finish(self, row_id: int, status: str, message: str, run_id: str | None = None) -> None:
        ...


class SqlRecorder:
    """ops.workflow_runs. GitHub run id / URL come from the Actions environment when present."""

    def start(self, phase: str, ctx: Context) -> int:
        from .db import read_sql

        gh_id = os.environ.get("GITHUB_RUN_ID")
        url = None
        if gh_id and os.environ.get("GITHUB_REPOSITORY"):
            server = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
            url = f"{server}/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{gh_id}"
        df = read_sql(
            "insert into ops.workflow_runs "
            "(phase, season, week, slate, settings, gh_run_id, gh_run_url, host) "
            "values (%s, %s, %s, %s, %s::jsonb, %s, %s, %s) returning id",
            (phase, ctx.season, ctx.week, ctx.slate, json.dumps(ctx.settings()),
             int(gh_id) if gh_id else None, url, "github" if gh_id else socket.gethostname()),
        )
        return int(df[0, "id"])

    def finish(self, row_id: int, status: str, message: str, run_id: str | None = None) -> None:
        from .db import execute

        execute(
            "update ops.workflow_runs set status = %s, finished_at = now(), message = %s, "
            "run_id = coalesce(%s::uuid, run_id) where id = %s",
            (status, message[:2000], run_id, row_id),
        )


def run_phase(phase: str, ctx: Context, runner: Runner | None = None,
              recorder: Recorder | None = None) -> str:
    """Run one phase, recording it. Returns the last output line; raises PhaseFailed."""
    run = runner or run_cli
    rec = recorder or SqlRecorder()
    row = rec.start(phase, ctx)
    message, run_id = "", None
    try:
        for step in plan(phase, ctx):
            try:
                if step.fn is not None:
                    run_id = step.fn(ctx, run) or run_id
                    message = f"run {run_id}" if run_id else message
                else:
                    message = _last_line(run(list(step.args))) or message
            except StepFailed as e:
                if step.soft:
                    print(f"(soft) {' '.join(step.args)}: {_last_line(e.output)}", flush=True)
                    continue
                raise PhaseFailed(_last_line(e.output) or str(e)) from e
    except Exception as e:
        reason = str(e) if isinstance(e, PhaseFailed) else f"{type(e).__name__}: {e}"
        rec.finish(row, "failed", reason, run_id)
        if isinstance(e, PhaseFailed):
            raise
        raise PhaseFailed(reason) from e
    rec.finish(row, "success", message or "done", run_id)
    return message
