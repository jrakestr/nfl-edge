from __future__ import annotations

import typer

app = typer.Typer(
    help="nfl-edge: one correlated simulation feeding lines, props, and DFS.",
    pretty_exceptions_enable=False,  # tracebacks with locals could leak the DSN
)
db_app = typer.Typer(help="Database plumbing: migrations and row counts.")
app.add_typer(db_app, name="db")


@db_app.command("migrate")
def db_migrate(dry_run: bool = typer.Option(False, help="List pending migrations only")):
    """Apply pending db/migrations/*.sql against DATABASE_URL."""
    from . import migrate

    applied = migrate.apply(dry_run=dry_run)
    if not applied:
        typer.echo("no pending migrations")
    for name in applied:
        typer.echo(f"applied {name}")


@db_app.command("counts")
def db_counts():
    """Row counts per raw/model table, by season."""
    import polars as pl

    from .db import table_counts
    from .ingest.players import unresolved_snap_pfr

    with pl.Config(tbl_rows=-1, tbl_hide_dataframe_shape=True, tbl_hide_column_data_types=True):
        counts = table_counts()
        typer.echo(str(counts))
        if counts.is_empty():
            typer.echo("no raw/model tables yet; run `nfl-edge db migrate`")
            return
        typer.echo("snap_counts pfr ids unresolved via raw.players:")
        typer.echo(str(unresolved_snap_pfr()))


@app.command()
def ingest(
    week: int = typer.Option(None, help="NFL week (optional with --lines-only: whole season)"),
    season: int = typer.Option(2026),
    lines_only: bool = typer.Option(False, help="Only snapshot market lines (the cron path)"),
):
    """Pull nflverse data into Postgres (idempotent). Pre-kickoff seasons load what is published."""
    from .ingest import consensus, context, opportunity, players, schedules, stats
    from .ingest import season as season_guard

    if week is None and not lines_only:
        raise typer.BadParameter("--week is required unless --lines-only")
    typer.echo(f"schedules: {schedules.run([season], week=week, lines_only=lines_only)}")
    if lines_only:
        return
    if not season_guard.published(season):
        typer.echo(f"note: {season} is ahead of nflverse's current season "
                   f"({season_guard.current_season()}); stats, opportunity and snap counts are skipped, "
                   "rosters come from the preseason roster file")
    typer.echo(f"players: {players.run()}")
    for name, mod in (("stats", stats), ("opportunity", opportunity),
                      ("consensus", consensus), ("context", context)):
        typer.echo(f"{name}: {mod.run([season], week=week)}")


INGEST_ORDER = ("players", "schedules", "stats", "opportunity", "consensus", "context")


@app.command()
def backfill(
    start: int = 2020,
    end: int = 2025,
    modules: str = typer.Option(",".join(INGEST_ORDER), help="Comma-separated subset to run"),
):
    """Load prior seasons for backtesting: players once, then each module per season."""
    import time

    from .ingest import consensus, context, opportunity, players, schedules, stats

    mods = {"players": players, "schedules": schedules, "stats": stats,
            "opportunity": opportunity, "consensus": consensus, "context": context}
    selected = [m.strip() for m in modules.split(",") if m.strip()]
    unknown = [m for m in selected if m not in mods]
    if unknown:
        raise typer.BadParameter(f"unknown modules {unknown}; choose from {list(INGEST_ORDER)}")
    if "players" in selected:
        t = time.time()
        typer.echo(f"players: {players.run()} ({time.time() - t:.0f}s)")
    for season in range(start, end + 1):
        for name in INGEST_ORDER[1:]:
            if name not in selected:
                continue
            t = time.time()
            typer.echo(f"{season} {name}: {mods[name].run([season])} ({time.time() - t:.0f}s)")
    if "consensus" in selected:
        typer.echo("consensus coverage (weeks with ECR per season):")
        typer.echo(str(consensus.coverage(consensus.fetch(list(range(start, end + 1))))))


@app.command()
def priors(
    season: int = typer.Option(...),
    week: int = typer.Option(...),
    team: str = typer.Option("KC", help="Team to print"),
):
    """Print one team's priors and its top-8 players (Checkpoint B eyeball)."""
    import polars as pl

    from . import priors as pr

    p = pr.build(season, week)
    with pl.Config(tbl_rows=-1, tbl_cols=-1, tbl_width_chars=160, float_precision=3):
        typer.echo(f"league: { {k: round(v, 3) for k, v in p.team.league.items()} }")
        typer.echo(str(p.team.teams.filter(pl.col("team") == team)))
        u = p.usage.filter(pl.col("team") == team)
        typer.echo(
            f"{team}: {u.height} active players with history; "
            f"target_share sum={u['target_share'].sum():.3f} carry_share sum={u['carry_share'].sum():.3f} "
            f"rz_target sum={u['rz_target_share'].sum():.3f} rz_carry sum={u['rz_carry_share'].sum():.3f} "
            f"qb1={u.filter(pl.col('is_qb1'))['full_name'].to_list()}"
        )
        top = u.with_columns((pl.col("target_share") + pl.col("carry_share")).alias("_u")) \
            .sort("_u", descending=True).head(8).drop("_u")
        top = top.join(p.efficiency.drop(["position", "season", "week"]), on="player_id", how="left")
        typer.echo(str(top.drop(["season", "week", "team"])))
        qb_per_team = p.usage.group_by("team").agg(pl.col("is_qb1").sum())
        typer.echo(f"teams with exactly one QB1: {int((qb_per_team['is_qb1'] == 1).sum())}/{qb_per_team.height}")


@app.command()
def sim(
    week: int = typer.Option(...),
    season: int = typer.Option(2026),
    draws: int = typer.Option(None, help="Draws per game (default: config draws_per_game)"),
    seed: int = typer.Option(None, help="Base seed (default: config seed)"),
    note: str = typer.Option(None),
    no_persist: bool = typer.Option(False, help="Write parquet only; skip model.* tables"),
):
    """Run the correlated game simulator for a week: parquet draws + model.* summaries + checks."""
    import polars as pl

    from .sim import slate

    r = slate.run(season, week, draws=draws, seed=seed, note=note, persist=not no_persist)
    typer.echo(r.summary())
    with pl.Config(tbl_rows=-1, tbl_cols=-1, tbl_width_chars=160, float_precision=2):
        typer.echo(str(r.proj_games.select(["game_id", "fair_spread", "market_spread", "fair_total",
                                            "market_total", "home_win_prob", "p_home_cover_market",
                                            "p_over_market"])))
        failed = r.checks.filter(~pl.col("passed"))
        if not failed.is_empty():
            typer.echo("checks not passed:")
            typer.echo(str(failed.select(["severity", "check_name", "game_id", "team", "value",
                                          "threshold", "detail"])))


def _parse_weeks(spec: str) -> list[int]:
    out: list[int] = []
    for part in spec.split(","):
        part = part.strip()
        if "-" in part:
            a, b = part.split("-")
            out += list(range(int(a), int(b) + 1))
        elif part:
            out.append(int(part))
    return out


@app.command()
def backtest(
    season: int = typer.Option(2025),
    weeks: str = typer.Option("1-18", help="e.g. 1-18 or 3,5,7-9"),
    draws: int = typer.Option(5000),
    seed: int = typer.Option(None),
    note: str = typer.Option(None),
):
    """Simulate past weeks from strictly-prior data; grade vs closing lines, results, and ECR."""
    from .results import calibration

    bt = calibration.run(season, _parse_weeks(weeks), draws=draws, seed=seed, note=note)
    typer.echo(bt.report_path.read_text())


@app.command()
def lines(
    week: int = typer.Option(...),
    season: int = typer.Option(2026),
    run: str = typer.Option(None, help="run_id (default: latest sim run for the week)"),
    as_json: bool = typer.Option(False, "--json", help="Emit the payload the UI reads instead of text"),
    min_edge: float = typer.Option(0.0, help="Edge table: hide rows below this edge"),
    recompute: bool = typer.Option(False, help="Delete and recompute this run's edges and verdicts"),
):
    """Plain-English verdicts + edge table for a simulated week; persists model.edges and model.verdicts."""
    import json

    import polars as pl

    from .outputs import lines_io

    w, stats = lines_io.build(season, week, run_id=run, recompute=recompute)
    n_verdicts = lines_io.persist(w)
    if as_json:
        typer.echo(json.dumps(w.to_dict(), indent=1))
        return
    typer.echo(w.summary)
    typer.echo(f"(edges: {stats.get('edges', 0)} new of {stats.get('rows', 0)} across {stats.get('snapshots', 0)} "
               f"snapshots, parity {stats.get('parity')}; verdicts: {n_verdicts} new)\n")
    for g in w.games:
        flag = "" if g.status == "ok" else f"  [{g.status.upper()}]"
        typer.echo(f"{g.away} @ {g.home}  {g.kickoff or ''}{flag}")
        for s in g.sentences:
            typer.echo(f"  {s}")
        typer.echo("")
    with pl.Config(tbl_rows=-1, tbl_cols=-1, tbl_width_chars=140, float_precision=3,
                   tbl_hide_dataframe_shape=True, tbl_hide_column_data_types=True):
        typer.echo(str(lines_io.edge_table(w, min_edge)))


@app.command()
def props(week: int, season: int = 2026):
    raise NotImplementedError("outputs.props not built yet")


@app.command()
def dfs(week: int, site: str = "dk", slate: str = "main", season: int = 2026):
    raise NotImplementedError("dfs wrappers not built yet")


@app.command()
def grade(
    week: int = typer.Option(...),
    season: int = typer.Option(2026),
    run: str = typer.Option(None, help="run_id (default: every sim run for the week)"),
):
    """Grade every edge and verdict of a week against scores and the close; write model.results."""
    import polars as pl

    from .results import calibration as cal
    from .results import grade as G

    report = G.run(season, week, run_id=run)
    n_pq = len(report.skipped_no_parquet)
    typer.echo(
        f"graded {len(report.run_ids)} runs · {report.n_rows} edge rows · {report.n_verdicts} verdict rows · "
        f"skipped: {report.skipped_unplayed} games unplayed, {n_pq} runs without parquet"
    )
    for rid in report.skipped_no_parquet:
        typer.echo(f"  skipped {rid}: parquet missing")
    if report.brier_sim is not None:
        typer.echo(f"Brier sim {report.brier_sim:.4f} vs close {report.brier_close:.4f}"
                   f"{'' if report.monotone is None else f'; monotone={report.monotone}'}")
    with pl.Config(tbl_rows=-1, tbl_cols=-1, tbl_width_chars=160, float_precision=3,
                   tbl_hide_dataframe_shape=True, tbl_hide_column_data_types=True):
        for title, df in (("picks", report.picks), ("verdicts", report.verdicts),
                          ("games", report.games), ("calibration", report.calibration)):
            if df.is_empty():
                continue
            typer.echo(f"\n{title}")
            typer.echo(str(df))
    report_path = cal.results_report(season)
    typer.echo(f"\n{report_path}")


if __name__ == "__main__":
    app()
