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
            if name == "schedules":
                result = schedules.run([season], snapshot_lines=False)
            else:
                result = mods[name].run([season])
            typer.echo(f"{season} {name}: {result} ({time.time() - t:.0f}s)")
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
    fair = stats.get("fair_props") or {}
    if fair:
        by = fair.get("by_stat") or {}
        parts = " ".join(f"{k}={by[k]}" for k in (
            "pass_yds", "pass_td", "int", "rush_yds", "rush_td", "rec", "rec_yds", "rec_td", "anytime_td",
        ) if k in by)
        typer.echo(f"fair_props run {fair.get('run_id')}: {fair.get('n_rows', 0)} rows" + (f" ({parts})" if parts else ""))
    pe = stats.get("prop_edges") or {}
    if pe.get("n_edges"):
        typer.echo(f"prop_edges: {pe['n_edges']} rows from {pe.get('n_props', 0)} market lines")
    for g in w.games:
        flag = "" if g.status == "ok" else f"  [{g.status.upper()}]"
        typer.echo(f"{g.away} @ {g.home}  {g.kickoff or ''}{flag}")
        for s in g.sentences:
            typer.echo(f"  {s}")
        typer.echo("")
    with pl.Config(tbl_rows=-1, tbl_cols=-1, tbl_width_chars=140, float_precision=3,
                   tbl_hide_dataframe_shape=True, tbl_hide_column_data_types=True):
        typer.echo(str(lines_io.edge_table(w, min_edge)))


@app.command("stale-weeks")
def stale_weeks(season: int = typer.Option(2026)):
    """Print weeks whose newest run has a snapshot newer than its verdicts (one week per line)."""
    from .outputs import lines_io

    for week in lines_io.stale_weeks(season):
        typer.echo(week)


@app.command("current-week")
def current_week_cmd(season: int = typer.Option(2026)):
    """Print the REG week in raw.schedules that spans today (Saturday before Sunday included)."""
    from .rebuild import current_week

    week = current_week(season)
    if week is None:
        raise typer.Exit(code=1)
    typer.echo(week)


@app.command("slate-count")
def slate_count_cmd(season: int = typer.Option(2026), week: int = typer.Option(...)):
    """Print how many games raw.schedules has for the week."""
    from .rebuild import slate_games

    typer.echo(slate_games(season, week))


@app.command("newest-run")
def newest_run_cmd(season: int = typer.Option(2026), week: int = typer.Option(...)):
    """Print `run_id n_games` for the newest sim of the week."""
    from .rebuild import newest_run

    row = newest_run(season, week)
    if row is None:
        raise typer.Exit(code=1)
    typer.echo(f"{row[0]} {row[1]}")


@app.command("drop-incomplete")
def drop_incomplete_cmd(
    season: int = typer.Option(2026),
    week: int = typer.Option(...),
    after: str = typer.Option(..., help="ISO timestamp; delete later incomplete runs"),
):
    """Delete sim_runs created after `after` whose proj_games count ≠ the week's slate."""
    from datetime import datetime

    from .rebuild import drop_incomplete

    ts = datetime.fromisoformat(after)
    n = drop_incomplete(season, week, ts)
    typer.echo(n)


@app.command()
def overrides(
    season: int = typer.Option(...),
    week: int = typer.Option(...),
    file: str = typer.Option(..., "--file", help="CSV: player, status, usage_multiplier, note"),
):
    """Upsert raw.player_overrides from a CSV. Unmatched names are reported, not guessed."""
    from pathlib import Path

    from .ingest import overrides as ov

    r = ov.run(season, week, Path(file))
    typer.echo(
        f"overrides {r['season']} wk{r['week']}: {r['written']} written / {r['rows']} rows"
    )
    for pid in r["matched"]:
        typer.echo(f"  matched {pid}")
    for u in r["unmatched"]:
        typer.echo(f"  {u.get('reason', 'unmatched')}: {u.get('player')} "
                   f"team={u.get('team')} pos={u.get('position')}")


@app.command("dk-salaries")
def dk_salaries(
    season: int = typer.Option(...),
    week: int = typer.Option(...),
    file: str = typer.Option(None, "--file", help="DK salary export CSV"),
    site: str = typer.Option("dk"),
    slate: str = typer.Option("main"),
):
    """Upsert raw.dk_salaries from a DK export. Status O/D/Q/OUT/IR write raw.player_overrides."""
    from pathlib import Path

    from .ingest import dk_salaries as dk

    path = Path(file) if file else dk.default_path(season, week, slate)
    r = dk.run(season, week, path, site=site, slate=slate)
    typer.echo(
        f"dk salaries {r['slate_id']}: {r['written']} written / {r['rows']} rows, "
        f"{r['matched']} matched, {r['unmatched_n']} unmatched, "
        f"{r['overrides_written']} overrides"
    )
    for u in r["unmatched"]:
        typer.echo(
            f"  {u.get('match_reason', 'unmatched')}: {u.get('name')} "
            f"team={u.get('team')} pos={u.get('position')} status={u.get('status')}"
        )
    for s in r["override_skipped"]:
        typer.echo(
            f"  override-{s.get('reason')}: {s.get('name')} team={s.get('team')} status={s.get('status')}"
        )


@app.command()
def dfs(
    week: int = typer.Option(...),
    season: int = typer.Option(2026),
    site: str = typer.Option("dk"),
    slate: str = typer.Option(..., help="Salary slate (main, full, …). IDs are per-slate; never mix."),
    run: str = typer.Option(None, help="run_id (default: newest sim for the week)"),
    lineups: int = typer.Option(150),
    field: int = typer.Option(20000, help="GPP simulation iterations"),
    export: str = typer.Option(None, "--export", help="DK upload CSV path, stamped with run_id"),
):
    """Export this slate, run the optimizer + GPP sim, persist lineups/exposure."""
    from pathlib import Path

    from .dfs.pipeline import run as dfs_run

    r = dfs_run(
        season, week, site=site, slate=slate, run_id=run,
        lineups=lineups, field=field, export=Path(export) if export else None,
    )
    typer.echo(
        f"dfs {r['slate_id']}: {r['n_lineups']} lineups, {r['n_exposure']} exposure, "
        f"upload {r['upload']}"
    )


@app.command()
def props(
    week: int = typer.Option(...),
    season: int = typer.Option(2026),
    file: str = typer.Option(None, "--file", help="Optional CSV: player, stat, line, over_odds, under_odds"),
    run: str = typer.Option(None, help="run_id (default: newest sim for the week)"),
):
    """Optional CSV ingest, then P(over) from parquet for any market_props on the week."""
    from pathlib import Path

    from .market import props_manual
    from .outputs import props as props_out

    if file:
        loaded = props_manual.run(season, week, Path(file))
        typer.echo(
            f"props {loaded['season']} wk{loaded['week']}: {loaded['written']} written / {loaded['rows']} rows"
        )
        for u in loaded["unmatched"]:
            typer.echo(
                f"  {u.get('reason', 'unmatched')}: {u.get('player')} stat={u.get('stat')} "
                f"team={u.get('team')} pos={u.get('position')}"
            )
    edges = props_out.run(season, week, run_id=run)
    typer.echo(
        f"prop_edges run {edges['run_id']}: {edges['n_edges']} rows from {edges['n_props']} lines"
    )
    for s in edges["skipped"]:
        typer.echo(
            f"  {s.get('reason')}: {s.get('player_name')} {s.get('stat')} {s.get('line')}"
        )


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
    dfs = report.dfs or {}
    if dfs.get("skipped"):
        typer.echo(f"dfs: skipped ({dfs.get('reason')})")
    elif dfs.get("n_lineups"):
        typer.echo(f"dfs: {dfs['n_lineups']} lineups graded")
    props = report.props or {}
    if props.get("skipped"):
        typer.echo(f"props: skipped ({props.get('reason')})")
    elif props.get("n_rows"):
        typer.echo(f"props: {props['n_rows']} edges graded")
    fair = (props.get("fair") or {})
    if fair.get("skipped"):
        typer.echo(f"fair_props: skipped ({fair.get('reason')})")
    elif fair.get("n_rows"):
        typer.echo(f"fair_props: {fair['n_rows']} rows graded")


@app.command("score-actuals")
def score_actuals(season: int = typer.Option(...)):
    """Score REG skill weekly lines into model.player_fpts_actual. Idempotent."""
    from .results import actuals as A

    out = A.persist(season)
    types = " ".join(f"{k}={v}" for k, v in sorted(out["season_types"].items()))
    rec = out["reconcile"]
    typer.echo(f"season_type {season}: {types}")
    typer.echo(f"ppr reconcile: within {rec['within']}  outside {rec['outside']}")
    for w in rec["worst"]:
        typer.echo(
            f"  wk{w['week']} {w['position']} {w['player_name']} "
            f"ours={w['ours']:.2f} nfl={w['theirs']:.2f} diff={w['diff']:+.2f} "
            f"st_td={w['special_teams_tds']}"
        )
    if out["blocked"]:
        typer.echo("blocked: PPR outside the gate; table not written")
        raise typer.Exit(code=1)
    typer.echo(
        f"player_fpts_actual {season}: {out['written']} rows "
        f"({out['opportunity']} with opportunity)"
    )


if __name__ == "__main__":
    app()
