from __future__ import annotations

import typer

from .config import load_yaml

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
        typer.echo(str(table_counts()))
        typer.echo("snap_counts pfr ids unresolved via raw.players:")
        typer.echo(str(unresolved_snap_pfr()))


@app.command()
def ingest(
    week: int = typer.Option(..., help="NFL week"),
    season: int = typer.Option(2026),
    lines_only: bool = typer.Option(False, help="Only snapshot market lines"),
):
    """Pull nflverse data into Postgres (idempotent)."""
    from .ingest import consensus, context, opportunity, players, schedules, stats

    typer.echo(f"schedules: {schedules.run([season], week=week, lines_only=lines_only)}")
    if lines_only:
        return
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
def sim(week: int, season: int = 2026):
    """Run the game simulator for a week and persist draws."""
    cfg = load_yaml("sim.yaml")
    raise NotImplementedError(f"sim not built yet (draws_per_game={cfg['draws_per_game']})")


@app.command()
def lines(week: int, season: int = 2026):
    raise NotImplementedError("outputs.lines not built yet")


@app.command()
def props(week: int, season: int = 2026):
    raise NotImplementedError("outputs.props not built yet")


@app.command()
def dfs(week: int, site: str = "dk", slate: str = "main", season: int = 2026):
    raise NotImplementedError("dfs wrappers not built yet")


@app.command()
def grade(week: int, season: int = 2026):
    raise NotImplementedError("results.grade not built yet")


if __name__ == "__main__":
    app()
