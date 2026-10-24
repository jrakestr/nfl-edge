from __future__ import annotations

from pathlib import Path
from typing import Annotated

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


storage_app = typer.Typer(help="Private Supabase Storage: salary files and sim draws.")
app.add_typer(storage_app, name="storage")


def _storage_week(season: int, week: int | None) -> int:
    from . import workflow

    week = week or workflow.board_week(season)
    if week is None:
        typer.echo(f"no current week for {season}; pass --week")
        raise typer.Exit(1)
    return week


def _storage_run(season: int, week: int, run_id: str | None) -> str:
    from .rebuild import newest_run

    if run_id:
        return run_id
    newest = newest_run(season, week)
    if newest is None:
        typer.echo(f"no sim run for {season} week {week}")
        raise typer.Exit(1)
    return newest[0]


def _storage_call(fn, *args):
    from .storage import StorageError

    try:
        return fn(*args)
    except StorageError as e:
        typer.echo(str(e))
        raise typer.Exit(1) from e


@storage_app.command("push-salaries")
def storage_push_salaries(week: int = typer.Option(None), season: int = typer.Option(2026)):
    """Upload this week's data/dk salary files so a cloud run can use them."""
    from . import storage

    week = _storage_week(season, week)
    for name, digest in _storage_call(storage.push_salaries, season, week):
        typer.echo(f"pushed {name} sha256={digest[:12]}")


@storage_app.command("pull-salaries")
def storage_pull_salaries(week: int = typer.Option(None), season: int = typer.Option(2026)):
    """Download this week's salary files into data/dk."""
    from . import storage

    week = _storage_week(season, week)
    got = _storage_call(storage.pull_salaries, season, week)
    if not got:
        typer.echo(f"no salary files in Storage for {season} week {week}; "
                   f"run `nfl-edge storage push-salaries --week {week}` where the CSVs are")
    for name, digest in got:
        typer.echo(f"pulled {name} sha256={digest[:12]}")


@storage_app.command("push-draws")
def storage_push_draws(week: int = typer.Option(None), season: int = typer.Option(2026),
                       run_id: str = typer.Option(None, help="Default: newest run of the week")):
    """Upload a run's draws so lines, props and DFS can run elsewhere."""
    from . import storage

    week = _storage_week(season, week)
    rid = _storage_run(season, week, run_id)
    n = _storage_call(storage.push_draws, season, week, rid)
    typer.echo(f"draws {rid[:8]}: {n} files uploaded")


@storage_app.command("pull-draws")
def storage_pull_draws(week: int = typer.Option(None), season: int = typer.Option(2026),
                       run_id: str = typer.Option(None, help="Default: newest run of the week")):
    """Download a run's draws into data/draws."""
    from . import storage

    week = _storage_week(season, week)
    rid = _storage_run(season, week, run_id)
    n = _storage_call(storage.pull_draws, season, week, rid)
    typer.echo(f"draws {rid[:8]}: {n} files downloaded")


ingest_app = typer.Typer(help="Pull data into Postgres.")
app.add_typer(ingest_app, name="ingest")


@ingest_app.callback(invoke_without_command=True)
def ingest(
    ctx: typer.Context,
    week: int = typer.Option(None, help="NFL week (optional with --lines-only: whole season)"),
    season: int = typer.Option(2026),
    lines_only: bool = typer.Option(False, help="Only snapshot market lines (the cron path)"),
):
    """Pull nflverse data into Postgres (idempotent). Pre-kickoff seasons load what is published."""
    if ctx.invoked_subcommand is not None:
        return
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


@ingest_app.command("odds-api")
def ingest_odds_api(
    markets: str = typer.Option("h2h,spreads,totals", help="Comma-separated Odds API markets"),
    regions: str = typer.Option("us", help="Comma-separated Odds API regions"),
    force: bool = typer.Option(False, "--force", help="Insert even if a recent duplicate snapshot exists"),
):
    """One Odds API pull into raw.market_lines. Costs markets × regions credits."""
    from .ingest import odds_api as odds

    try:
        r = odds.run(markets=markets, regions=regions, force=force)
    except odds.RecentDuplicate as e:
        typer.echo(str(e))
        raise typer.Exit(code=1) from None
    except odds.ZeroMatch as e:
        for s in e.skipped:
            typer.echo(f"skipped: {s['away']} @ {s['home']} {s['date']}")
        typer.echo(str(e))
        raise typer.Exit(code=1) from None
    for s in r["skipped"]:
        typer.echo(f"skipped: {s['away']} @ {s['home']} {s['date']}")
    warn = odds.remaining_warning(r["remaining"])
    if warn:
        typer.echo(warn)
    typer.echo(
        f"odds_api: {r['written']} rows, {r['books']} books, skipped={r['skipped_n']}, "
        f"remaining={r['remaining']}, used={r['used']}"
    )


@ingest_app.command("fantasypros-rankings")
def ingest_fantasypros_rankings(
    season: int = typer.Option(...),
    week: int = typer.Option(...),
):
    """One FantasyPros weekly rankings pull into raw.fantasypros_snapshots (as-of, never overwritten)."""
    from .ingest import fantasypros_rankings as fpr
    from .ingest.fantasypros import FantasyProsError

    try:
        r = fpr.run(season, week)
    except (FantasyProsError, RuntimeError) as e:
        typer.echo(f"error: {e}")
        raise typer.Exit(code=1) from None
    typer.echo(
        f"fantasypros rankings {r['season']} wk{r['week']}: {r['calls']} call, "
        f"{r['snapshots']} snapshot rows, {r['matched']} matched, {r['unmatched_n']} unmatched"
    )
    for u in r["unmatched"][:25]:
        typer.echo(f"  {u['reason']}: {u['name']} team={u['team']} pos={u['position']}")
    if r["unmatched_n"] > 25:
        typer.echo(f"  ... {r['unmatched_n'] - 25} more unmatched")


@ingest_app.command("fantasypros-injury-reports")
def ingest_fantasypros_injury_reports(
    season: int = typer.Option(...),
    week: int = typer.Option(...),
):
    """One FantasyPros weekly injury report (practice days, probability, update date) appended to raw.fantasypros_snapshots."""
    from .ingest import fantasypros_injury_reports as fpi
    from .ingest.fantasypros import FantasyProsError

    try:
        r = fpi.run(season, week)
    except (FantasyProsError, RuntimeError) as e:
        typer.echo(f"error: {e}")
        raise typer.Exit(code=1) from None
    typer.echo(
        f"fantasypros injury report {r['season']} wk{r['week']}: {r['calls']} call, "
        f"{r['snapshots']} snapshot rows, {r['matched']} matched, {r['unmatched_n']} offense unmatched"
    )
    for u in r["unmatched"][:25]:
        typer.echo(f"  {u['reason']}: {u['name']} team={u['team']} pos={u['position']}")


@ingest_app.command("fantasypros-points")
def ingest_fantasypros_points(
    season: int = typer.Option(...),
    start: int = typer.Option(1, help="First week"),
    end: int = typer.Option(..., help="Last week (one call covers the range)"),
):
    """One FantasyPros weekly PPR points pull appended to raw.fantasypros_snapshots (player_points)."""
    from .ingest import fantasypros_points as fpp
    from .ingest.fantasypros import FantasyProsError

    try:
        r = fpp.run(season, start, end)
    except (FantasyProsError, RuntimeError, ValueError) as e:
        typer.echo(f"error: {e}")
        raise typer.Exit(code=1) from None
    typer.echo(
        f"fantasypros points {r['season']} wk{r['start']}-{r['end']}: {r['calls']} call, "
        f"{r['snapshots']} snapshot rows, {r['matched']} matched, {r['unmatched_n']} players unmatched"
    )
    for u in r["unmatched"][:25]:
        typer.echo(f"  {u['reason']}: {u['name']} team={u['team']} pos={u['position']}")


@ingest_app.command("fantasypros-news")
def ingest_fantasypros_news(
    category: str = typer.Option(
        None, help="Optional category: injury | recap | transaction | rumor | breaking"
    ),
    limit: int = typer.Option(100, help="News items to fetch (1..100)"),
    fpid: int = typer.Option(None, help="Optional FantasyPros player ID to fetch player-specific news"),
):
    """One FantasyPros news pull appended to raw.fantasypros_news (idempotent on news_id)."""
    from .ingest import fantasypros_news as fpn
    from .ingest.fantasypros import FantasyProsError

    try:
        r = fpn.run(category=category, limit=limit, fpid=fpid)
    except (FantasyProsError, RuntimeError, ValueError) as e:
        typer.echo(f"error: {e}")
        raise typer.Exit(code=1) from None
    typer.echo(
        f"fantasypros news: {r['calls']} call, {r['written']} new of {r['items']} items, "
        f"{r['matched']} matched, {r['unmatched_n']} unmatched"
    )
    for u in r["unmatched"][:15]:
        typer.echo(f"  unmatched fp_id={u['fp_player_id']} team={u['team']}: {u['title'][:60]}")


@ingest_app.command("fantasypros-status")
def ingest_fantasypros_status(
    season: int = typer.Option(...),
    week: int = typer.Option(...),
    dry_run: bool = typer.Option(False, "--dry-run", help="Show what would be saved; save nothing"),
):
    """One FantasyPros injuries pull into raw.player_overrides; the newest information wins."""
    from .ingest import fantasypros_status as fps
    from .ingest.fantasypros import FantasyProsError

    try:
        r = fps.run(season, week, dry_run=dry_run)
    except (FantasyProsError, RuntimeError, ValueError) as e:
        typer.echo(f"error: {e}")
        raise typer.Exit(code=1) from None
    head = f"FantasyPros injuries for {r['season']} week {r['week']}"
    if r["dry_run"]:
        head += " (dry run, nothing was saved)"
    typer.echo(f"{head}: {len(r['upserts'])} players {'would be' if r['dry_run'] else 'were'} "
               f"saved as out, doubtful or questionable ({r['written']} rows written).")
    typer.echo(f"{len(r['already'])} players already match what is saved; "
               f"{len(r['kept_newer'])} were left alone because a saved entry from another source is newer; "
               f"{len(r['unmatched'])} could not be matched to a player.")
    if not r["dry_run"]:
        typer.echo(f"The full report ({r['snapshot_rows']} rows) was also kept as a snapshot.")
    for u in r["upserts"]:
        was = "no saved status" if not u["old"] else f"saved as {u['old']}"
        typer.echo(f"  {u['name']} ({u['player_id']}): {was}, now {u['status']} "
                   f"because FantasyPros reports it as of {u['note'].rsplit(' ', 1)[-1]}.")
    for k in r["kept_newer"]:
        typer.echo(f"  {k['name']} ({k['player_id']}): kept {k['saved_status']} ({k['saved_note']}) "
                   f"because it was saved after FantasyPros' report; FantasyPros says {k['fp_status']}.")
    for s in r["stale"]:
        typer.echo(f"  Saved FantasyPros row for {s['player_id']} ({s['status']}, {s['note']}) is no longer "
                   "in the FantasyPros list; I left it in place because a missing player is not proof he is healthy.")
    for u in r["unmatched"]:
        typer.echo(f"  Could not match {u['name']} ({u['team']}, {u['position']}): {u['reason']}.")
    if r["questionable_without_saved_row"]:
        typer.echo(f"{r['questionable_without_saved_row']} players are listed as questionable with no saved "
                   "status; nothing was saved for them because that carries no usage change.")
    if r["ignored"]["unknown_status"]:
        typer.echo(f"Skipped players with statuses I do not recognise: {', '.join(r['unknown_statuses'])}.")


@ingest_app.command("dk-history")
def ingest_dk_history(
    path: Annotated[Path, typer.Argument(exists=True, dir_okay=False, help="draftkings-contest-entry-history.csv")],
):
    """DraftKings entry-history CSV -> raw.dk_entry_history (upsert on Entry_Key; the whole file)."""
    from .ingest import dk_contests as dk

    try:
        r = dk.load_history(path)
    except dk.DkFileError as e:
        typer.echo(f"error: {e}")
        raise typer.Exit(code=1) from None
    typer.echo(f"dk history: {r['rows']} entries across {r['contests']} contests upserted")


@ingest_app.command("dk-standings")
def ingest_dk_standings(
    paths: Annotated[list[Path], typer.Argument(exists=True, dir_okay=False, help="contest-standings-<id>.zip files")],
    slate: str = typer.Option(None, help="Force the model slate id (default: resolved from raw.dk_salaries)"),
    force: bool = typer.Option(False, "--force", help="Reload even when the file is unchanged"),
):
    """DK standings zips -> per-contest ownership, FPTS, top-1% rate, cash line, and my slot breakdown.

    Run dk-history first so the entries that are yours get their slot rows."""
    from .ingest import dk_contests as dk

    failed = False
    for p in paths:
        try:
            r = dk.ingest_standings(p, slate_id=slate, force=force)
        except (dk.DkFileError, RuntimeError) as e:
            typer.echo(f"error: {p.name}: {e}")
            failed = True
            continue
        _echo_standings(r)
    if failed:
        raise typer.Exit(code=1)


@ingest_app.command("dk-ownership")
def ingest_dk_ownership(
    paths: Annotated[list[Path], typer.Argument(exists=True, dir_okay=False, help="dk-ownership-<id>.json from ops/dk-ownership.js")],
    slate: str = typer.Option(None, help="Force the model slate id (default: resolved from raw.dk_salaries)"),
    force: bool = typer.Option(False, "--force", help="Reload even when unchanged or already loaded from a standings CSV"),
):
    """Gamecenter-API ownership JSON -> raw.dk_contests (source='api'). No top-1% line; use for purged CSVs."""
    from .ingest import dk_contests as dk

    failed = False
    for p in paths:
        try:
            for r in dk.ingest_ownership(p, slate_id=slate, force=force):
                _echo_standings(r)
        except (dk.DkFileError, RuntimeError) as e:
            typer.echo(f"error: {p.name}: {e}")
            failed = True
    if failed:
        raise typer.Exit(code=1)


def _echo_standings(r) -> None:
    if r.status == "unchanged":
        typer.echo(f"{r.contest_key}: unchanged, skipped")
        return
    top1 = f"top1 {r.top1_score}" if r.top1_score is not None else "top1 n/a (api)"
    typer.echo(
        f"{r.contest_key} {r.contest_name or '(no history row)'}: {r.entries} entries, "
        f"{r.players} player rows, {top1}, cash {r.cash_score}, "
        f"slate {r.slate_id or 'unresolved'}, "
        f"mine {r.mine} ({r.slot_entries} with slots)"
    )
    if r.history_entries and r.history_entries != r.entries:
        typer.echo(f"  note: history says {r.history_entries} entries, file has {r.entries}")
    for eid, why in r.misses:
        typer.echo(f"  slots not written for entry {eid}: {why}")


@ingest_app.command("dk-folder")
def ingest_dk_folder(
    directory: Annotated[Path, typer.Argument(exists=True, file_okay=False, help="Folder of DK exports")],
    dry_run: bool = typer.Option(False, "--dry-run", help="Classify and report; write nothing"),
    force: bool = typer.Option(False, "--force", help="Reload even when the file is unchanged"),
):
    """A folder of DK exports -> entry history, then one classic standings load per usable file.

    Empty, conflicting, and unreadable files are listed and not written. Showdown and in-game
    files are skipped. Already-loaded files are left in place."""
    from .ingest import dk_contests as dk

    try:
        report = dk.load_folder(directory, dry_run=dry_run, force=force)
    except dk.DkFileError as e:
        typer.echo(f"error: {e}")
        raise typer.Exit(code=1) from None
    hist = report["history"]
    if hist:
        verb = "would upsert" if hist["dry_run"] else "upserted"
        typer.echo(f"dk history: {hist['rows']} entries across {hist['contests']} contests {verb}")
    elif report["history_missing"]:
        typer.echo("dk history: no draftkings-contest-entry-history.csv")
    typer.echo(f"{'contest':<12} {'status':<12} {'bytes':>10}  note")
    for row in report["rows"]:
        typer.echo(f"{row.contest_key:<12} {row.status:<12} {row.size:>10}  {row.note}")
    for res in report["results"]:
        _echo_standings(res)
    if report["gaps"]:
        typer.echo(f"gap: {len(report['gaps'])} NFL Classic contests in this window have no standings file")
        for g in report["gaps"]:
            when = g["contest_time"].strftime("%Y-%m-%d") if g.get("contest_time") else "-"
            name = dk._ENTRY_SUFFIX_RE.sub("", g.get("entry_name") or "")
            typer.echo(f"  {g['contest_key']}  {when}  {g.get('contest_entries') or '-'} entries  {name}")
    if report["failed"]:
        raise typer.Exit(code=1)


@ingest_app.command("espn-league")
def ingest_espn_league(
    season: int = typer.Option(2026),
    week: int = typer.Option(None, help="Reload only this week (default: every week through the current one)"),
    snapshot_only: bool = typer.Option(
        False, "--snapshot-only",
        help="Append a status snapshot and replace the available pool (no scores)"),
):
    """ESPN league 79530409 (League of Champions) -> fantasy.loc_* tables. Needs ESPN_S2 / ESPN_SWID."""
    from .ingest import espn_league as espn

    if snapshot_only and week is not None:
        raise typer.BadParameter("--snapshot-only always covers the current week; drop --week")
    if snapshot_only:
        try:
            s = espn.run_snapshot(season)
        except (RuntimeError, ValueError) as e:
            typer.echo(f"error: {e}")
            raise typer.Exit(code=1) from None
        typer.echo(f"espn league {s['season']} week {s['week']}: loc_status_snapshots: "
                   f"{s['inserted']} inserted at {s['pulled_at']:%Y-%m-%d %H:%M:%S} UTC; "
                   f"loc_available: {s['available']} replaced")
        return
    try:
        r = espn.run(season, week)
    except (RuntimeError, ValueError) as e:
        typer.echo(f"error: {e}")
        raise typer.Exit(code=1) from None
    typer.echo(f"espn league {r['season']} weeks {r['weeks'][0]}-{r['weeks'][-1]}:")
    for table, c in r["tables"].items():
        removed = f", {c['removed']} removed" if c["removed"] else ""
        typer.echo(f"  {table}: {c['inserted']} inserted, {c['updated']} updated{removed}")
    if r["rosters_skipped"]:
        typer.echo("  loc_rosters: skipped (a roster snapshot is the current week only)")
    for w in r["weeks"]:
        games = r["not_final"].get(w)
        typer.echo(f"  week {w}: " + (f"not final, {len(games)} games without a result: {', '.join(games)}"
                                    if games else "final"))


@ingest_app.command("live")
def ingest_live(
    week: int = typer.Option(...),
    season: int = typer.Option(2026),
):
    """ESPN scoreboard and box scores into raw.live_*. No key. Latest snapshot only."""
    from .ingest import espn_live

    report = espn_live.run(season, week)
    if not report["ok"]:
        typer.echo(f"live: stale, scoreboard failed ({report['error']})")
        return
    typer.echo(
        f"live: {report['games']} games, {len(report['written'])} box scores, "
        f"{len(report['skipped'])} skipped"
    )
    for skip in report["skipped"]:
        typer.echo(f"  {skip['espn_event_id']}: {skip['error']}")


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

    from .rebuild import prune_draws, sim_lock
    from .sim import slate

    try:
        with sim_lock(season, week):
            r = slate.run(season, week, draws=draws, seed=seed, note=note, persist=not no_persist)
            typer.echo(r.summary())
            with pl.Config(tbl_rows=-1, tbl_cols=-1, tbl_width_chars=160, float_precision=2):
                typer.echo(str(r.proj_games.select(["game_id", "fair_spread", "market_spread",
                                                    "fair_total", "market_total", "home_win_prob",
                                                    "p_home_cover_market", "p_over_market"])))
                failed = r.checks.filter(~pl.col("passed"))
                if not failed.is_empty():
                    typer.echo("checks not passed:")
                    typer.echo(str(failed.select(["severity", "check_name", "game_id", "team",
                                                  "value", "threshold", "detail"])))
            if not no_persist:
                for line in prune_draws():
                    typer.echo(line)
    except RuntimeError as e:
        if "already running" in str(e):
            typer.echo(str(e))
            raise typer.Exit(code=1) from e
        raise


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
    close: bool = typer.Option(
        False, "--close",
        help="Pin each game to the last pre-kickoff reference snapshot; mark verdicts backfilled",
    ),
):
    """Plain-English verdicts + edge table for a simulated week; persists model.edges and model.verdicts."""
    import json

    import polars as pl

    from .outputs import lines_io

    w, stats = lines_io.build(season, week, run_id=run, recompute=recompute, close=close)
    n_verdicts = lines_io.persist(w, backfilled=close)
    if as_json:
        typer.echo(json.dumps(w.to_dict(), indent=1))
        return
    typer.echo(w.summary)
    typer.echo(f"(edges: {stats.get('edges', 0)} new of {stats.get('rows', 0)} across {stats.get('snapshots', 0)} "
               f"snapshots, parity {stats.get('parity')}; verdicts: {n_verdicts} new)\n")
    if close:
        skipped = [g.game_id for g in w.games if g.market.get("snapshot_id") is None]
        if skipped:
            typer.echo("close: no pre-kickoff snapshot for " + ", ".join(skipped))
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
    if pe.get("skip_report"):
        typer.echo(pe["skip_report"])
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


@app.command("completed-weeks")
def completed_weeks_cmd(season: int = typer.Option(2026)):
    """Print REG weeks whose last gameday is before today (one week per line)."""
    from .rebuild import completed_weeks

    for week in completed_weeks(season):
        typer.echo(week)


@app.command("ungraded-completed")
def ungraded_completed_cmd(season: int = typer.Option(2026)):
    """Print completed REG weeks that still have ungraded games (one week per line)."""
    from .rebuild import ungraded_completed_weeks

    for week in ungraded_completed_weeks(season):
        typer.echo(week)


@app.command("missing-finals")
def missing_finals_cmd(
    season: int = typer.Option(2026),
    week: int = typer.Option(...),
):
    """Print game_ids with a null result. Exit 1 if any are missing."""
    from .rebuild import games_missing_result

    missing = games_missing_result(season, week)
    for game_id in missing:
        typer.echo(game_id)
    if missing:
        raise typer.Exit(code=1)


@app.command()
def phase(
    name: str = typer.Argument(
        ..., help="ingest | salaries | sim | lines | props | dfs | grade | refresh"),
    week: int = typer.Option(None, help="Default: the week being played, else the next one"),
    season: int = typer.Option(2026),
    slate: str = typer.Option(None, help="DFS: the salary file's slate key"),
    draws: int = typer.Option(None, help="Sim draws per game (default: sim.yaml draws_per_game)"),
    field_size: int = typer.Option(None, help="DFS room size (default: sim.yaml dfs.field_size)"),
    iterations: int = typer.Option(None, help="DFS sim iterations (default: sim.yaml dfs)"),
    full_field: bool = typer.Option(False, help="DFS: play the real contest room"),
    from_here: bool = typer.Option(
        False, "--from", help="Run this phase and every later one through DFS (each salary file)",
    ),
):
    """Run one phase of the week (or --from it onward), logged to ops.workflow_runs."""
    from . import workflow as W

    if week is None:
        week = W.board_week(season)
        if week is None:
            typer.echo(f"no current week for {season}; pass --week")
            raise typer.Exit(1)
    ctx = W.Context(season, week, slate=slate, draws=draws, field_size=field_size,
                    iterations=iterations, full_field=full_field)
    if from_here:
        todo = W.chain(name, W.week_slates(season, week))
    elif name == "dfs" and not slate:
        todo = [("dfs", s) for s in W.week_slates(season, week)]
    else:
        todo = [(name, slate)]
    if not todo:
        typer.echo(f"nothing to run: no DK salary files for {season} week {week}")
        raise typer.Exit(1)
    for ph, sl in todo:
        typer.echo(f"== {ph}{' ' + sl if sl else ''} {season} week {week}")
        try:
            msg = W.run_phase(ph, W.Context(**{**ctx.__dict__, "slate": sl}))
        except W.PhaseFailed as e:
            typer.echo(f"{ph} failed: {e}")
            raise typer.Exit(1) from e
        typer.echo(f"{ph} done: {msg}")


@app.command("change-check")
def change_check_cmd(
    week: int = typer.Option(None, help="Default: the week being played, else the next one"),
    season: int = typer.Option(2026),
):
    """What changed since the newest complete sim (overrides, ESPN status). Never sims."""
    from . import change_check, workflow

    week = week or workflow.board_week(season)
    if week is None:
        typer.echo(f"no week to check for {season}")
        raise typer.Exit(1)
    r = change_check.run(season, week)
    verdict = "re-sim suggested" if r["suggest_resim"] else "no re-sim needed"
    typer.echo(f"change-check {season} week {week}: {verdict}; "
               f"{len(r['reasons'])} changes, {len(r['info'])} line moves")
    for x in r["reasons"]:
        if x["source"] == "no-sim":
            typer.echo("  no complete sim for this week yet")
            continue
        typer.echo(f"  {x['player']} {x['team'] or ''} {x['source']}: "
                   f"{x['before'] or '-'} -> {x['after'] or '-'}"
                   f"{'' if x['affects_sim'] else ' (listed only)'}")


@app.command("slate-count")
def slate_count_cmd(season: int = typer.Option(2026), week: int = typer.Option(...)):
    """Print how many games raw.schedules has for the week."""
    from .rebuild import slate_games

    typer.echo(slate_games(season, week))


@app.command("newest-run")
def newest_run_cmd(season: int = typer.Option(2026), week: int = typer.Option(...)):
    """Print `run_id n_games n_player_games` for the newest sim of the week."""
    from .rebuild import newest_run

    row = newest_run(season, week)
    if row is None:
        raise typer.Exit(code=1)
    typer.echo(f"{row[0]} {row[1]} {row[2]}")


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


@app.command("prune-draws")
def prune_draws_cmd(
    season: int | None = typer.Option(None),
    week: int | None = typer.Option(None),
    dry_run: bool = typer.Option(False, "--dry-run"),
):
    """Delete extra parquet after a week is graded. Keeps sim_runs rows; nulls draws_path."""
    from .rebuild import prune_draws

    lines = prune_draws(season=season, week=week, dry_run=dry_run)
    if not lines:
        typer.echo("nothing to prune")
        return
    for line in lines:
        typer.echo(line)


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


@app.command("dk-fetch")
def dk_fetch(
    week: int = typer.Option(None, help="Default: the week being played, else the next one"),
    season: int = typer.Option(2026),
    push: bool = typer.Option(True, help="Also upload the files to private Storage"),
):
    """Download the week's DK salary files from DraftKings' lobby (no login) into data/dk."""
    import httpx

    from . import storage, workflow
    from .ingest import dk_lobby

    week = week or workflow.board_week(season)
    if week is None:
        typer.echo(f"no week for {season}; pass --week")
        raise typer.Exit(1)
    try:
        got = dk_lobby.fetch(season, week)
    except (dk_lobby.LobbyError, httpx.HTTPError, ValueError) as e:  # network or a DK change: one plain line
        typer.echo(f"dk-fetch: {type(e).__name__}: {e}")
        raise typer.Exit(1) from None
    saved = [f for f in got if f.path]
    for f in got:
        what = f"skipped: {f.skipped}" if f.skipped else f"{f.rows} players, {len(f.games)} games"
        typer.echo(f"{f.slate:<22} draft group {f.group.draft_group_id}  {what}")
    if not saved:
        typer.echo(f"dk-fetch: no salary files for {season} week {week} in the DK lobby")
        raise typer.Exit(1)
    if push:
        try:
            storage.push_salaries(season, week)
        except storage.StorageError as e:
            typer.echo(f"dk-fetch: saved locally, not pushed: {e}")
            raise typer.Exit(1) from None
    typer.echo(f"dk-fetch: {len(saved)} salary files for week {week}")


@app.command("dk-salaries")
def dk_salaries(
    season: int = typer.Option(...),
    week: int = typer.Option(...),
    file: str = typer.Option(None, "--file", help="DK salary export CSV"),
    site: str = typer.Option("dk"),
    slate: str = typer.Option("main"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Print Status merge; write nothing"),
    status_from: str = typer.Option(None, "--status-from", help="Authoritative slate key for Status merge"),
    salaries_only: bool = typer.Option(False, "--salaries-only", help="Upsert this slate's salaries; skip Status merge"),
    merge_status: bool = typer.Option(False, "--merge-status", help="Status merge only; skip salary upsert"),
):
    """Upsert raw.dk_salaries from a DK export. Week Status is a merge across on-disk CSVs."""
    from pathlib import Path

    from .ingest import dk_salaries as dk

    path = Path(file) if file else dk.default_path(season, week, slate)
    try:
        r = dk.run(
            season, week, path, site=site, slate=slate,
            dry_run=dry_run, status_from=status_from,
            salaries_only=salaries_only, merge_only=merge_status,
        )
    except ValueError as e:
        typer.echo(str(e))
        raise typer.Exit(1) from e
    prefix = "dry-run " if r.get("dry_run") else ""
    typer.echo(
        f"{prefix}dk salaries {r['slate_id']}: {r['written']} written / {r['rows']} rows, "
        f"{r['matched']} matched, {r['unmatched_n']} unmatched, "
        f"{r['overrides_written']} overrides"
    )
    typer.echo(f"failed to match: {r['unmatched_n']}")
    for u in r["unmatched"]:
        typer.echo(
            f"  {u.get('match_reason', 'unmatched')}: {u.get('name')} "
            f"team={u.get('team')} pos={u.get('position')} status={u.get('status')}"
        )
    for s in r.get("override_skipped") or []:
        typer.echo(
            f"  override-{s.get('reason')}: {s.get('name')} team={s.get('team')} status={s.get('status')}"
        )
    for line in r.get("merge_lines") or []:
        typer.echo(line)


@app.command("rts-status")
def rts_status(
    season: int = typer.Option(...),
    week: int = typer.Option(...),
    file: str = typer.Option(..., "--file", help="RTS projection export CSV"),
    second: str = typer.Option(None, "--second", help="Second-source CSV: player,team,position,proj,status"),
):
    """Upsert availability overrides from an RTS projection export. Never the sim."""
    from pathlib import Path

    from .ingest import rts_status as rts

    try:
        r = rts.run(season, week, Path(file), Path(second) if second else None)
    except ValueError as e:
        typer.echo(str(e))
        raise typer.Exit(1) from e
    typer.echo(
        f"rts-status {r['season']} wk{r['week']}: {r['written']} written / "
        f"{r['rts_rows']} RTS rows"
        + (f" / {r['src2_rows']} second-source rows" if r["second"] else "")
        + f" -> {r['csv']}"
    )
    for u in r["upserts"]:
        typer.echo(f"  {u['status']} x{u['usage_multiplier']}: {u['name']} ({u['player_id']})")
    for p in r["protected"]:
        typer.echo(f"  protected-manual: {p.get('name')} ({p['player_id']})")
    for q in r["skipped_qb_zero"]:
        typer.echo(f"  qb-zero-skipped: {q.get('player')} team={q.get('team')}")
    for n in r["near_zero"]:
        typer.echo(f"  near-zero listed: {n.get('player')} {n.get('proj'):.2f}")
    for u in r["unmatched"]:
        typer.echo(f"  {u.get('reason', 'unmatched')}: {u.get('player')} team={u.get('team')}")


@app.command()
def dfs(
    week: int = typer.Option(...),
    season: int = typer.Option(2026),
    site: str = typer.Option("dk"),
    slate: str = typer.Option(..., help="Salary slate (main, full, …). IDs are per-slate; never mix."),
    run: str = typer.Option(None, help="run_id (default: newest sim for the week)"),
    construction: str = typer.Option("mass", help="cash | single | mass (default mass)"),
    contest: str = typer.Option("gpp", help="Contest room: gpp (large-field) | single (single-entry)"),
    lineups: int = typer.Option(None, help="Override the construction's lineup count"),
    iterations: int = typer.Option(None, help="GPP sim iterations (default: sim.yaml dfs.iterations)"),
    field_size: int = typer.Option(
        None, help="Entries in the simulated room, scaled prizes (default: sim.yaml dfs.field_size)",
    ),
    full_field: bool = typer.Option(False, help="Play the real contest room (176k for gpp; slow)"),
    field: int = typer.Option(None, hidden=True, help="Deprecated: use --iterations"),
    export: str = typer.Option(None, "--export", help="DK upload CSV path, stamped with run_id"),
):
    """Export this slate, run the optimizer + GPP sim, persist lineups/exposure."""
    from pathlib import Path

    from .dfs import pipeline

    if field is not None:
        typer.echo("--field is deprecated; it means --iterations")
        iterations = iterations or field
    r = pipeline.run(
        season, week, site=site, slate=slate, run_id=run,
        construction=construction, contest=contest, lineups=lineups, iterations=iterations,
        field_size=field_size, full_field=full_field,
        export=Path(export) if export else None,
    )
    for d in r.get("injury_dropped") or []:
        typer.echo(
            f"  dropped {d.get('name')} {d.get('status')} "
            f"team={d.get('team')} fpts={d.get('fpts')}"
        )
    s = r.get("settings") or {}
    if s:
        typer.echo(
            f"  settings randomness={s.get('randomness')} "
            f"stacks={s.get('stacks_pct')}% "
            f"max_exposure={s.get('max_exposure')}% "
            f"uniques={s.get('num_uniques')}"
        )
    if r.get("field_size"):
        typer.echo(f"  field {r['field_size']} entries, {r.get('iterations')} iterations")
    t = r.get("timings") or {}
    if t:
        typer.echo("  seconds " + " ".join(f"{k}={v}" for k, v in t.items()))
        budget = 60 * float(r.get("max_minutes") or 0)
        if budget and t.get("total", 0) > budget:
            typer.echo(f"  slower than max_minutes ({t['total']}s > {budget:.0f}s)")
    typer.echo(
        f"dfs {r['slate_id']} {r.get('construction', 'mass')}/{r.get('contest', 'gpp')}: "
        f"{r['n_lineups']} lineups, {r['n_exposure']} exposure, "
        f"upload {r['upload']}"
    )
    for d in r.get("role_dropped") or []:
        typer.echo(f"  left out {d.get('name')} ({d.get('position')} {d.get('team')}): {d.get('status')}")
    from .research import auto_sync

    sync = auto_sync.run_post_dfs_sync(season, week, site=site, slate=slate)
    aud = sync.get("audit")
    if aud:
        vc = aud.get("verdict_counts") or {}
        typer.echo(
            f"  jev audit {r['slate_id']}: KEEP={vc.get('KEEP', 0)} FLAG={vc.get('FLAG', 0)} "
            f"VETO={vc.get('VETO', 0)} NO_READ={vc.get('NO_READ', 0)} "
            f"(wrote {aud.get('written_rows', 0)}, ${aud.get('actual_usd', 0.0):.4f})"
        )
    elif sync.get("audit_error"):
        typer.echo(f"  jev audit skipped: {sync['audit_error']}")


@app.command("dfs-validate")
def dfs_validate(
    file: Annotated[Path, typer.Option("--file", exists=True, dir_okay=False,
                                       help="A dk_upload_<slate_id>_<run8>_<source>.csv")],
    site: str = typer.Option("dk"),
    slate_id: str = typer.Option(None, help="Override the slate_id read from the filename"),
):
    """Audit an upload CSV against DK rules using this slate's raw.dk_salaries. Exit 1 on any failure."""
    from .db import read_sql
    from .dfs import parse, validate
    from .ingest.dk_salaries import slate_type_for

    try:
        sid = slate_id or parse.parse_upload_stamp(file)["slate_id"]
    except ValueError as e:
        typer.echo(str(e))
        raise typer.Exit(1) from e
    rows = read_sql(
        "select player_id, name, player_dk_id, position, roster_position, team, salary, game_info "
        "from raw.dk_salaries where site = %s and slate_id = %s",
        (site, sid),
    ).to_dicts()
    if not rows:
        typer.echo(f"no raw.dk_salaries for site={site} slate_id={sid}")
        raise typer.Exit(1)
    lineups = validate.read_upload(file)
    if not lineups:
        typer.echo(f"{file.name}: no lineups")
        raise typer.Exit(1)
    slate_key = sid.split("_", 2)[2] if sid.count("_") >= 2 else sid
    failures = dict(validate.validate_lineups(lineups, rows, slate_type_for(slate_key)))
    for k in range(1, len(lineups) + 1):
        if k in failures:
            typer.echo(f"{k:>3} FAIL " + "; ".join(failures[k]))
        else:
            typer.echo(f"{k:>3} ok")
    typer.echo(f"dfs-validate {sid}: {len(lineups) - len(failures)} of {len(lineups)} lineups legal")
    if failures:
        raise typer.Exit(1)


@app.command("dfs-cross")
def dfs_cross(
    slate: str = typer.Option(..., help="Salary slate key (e.g. monthurs)"),
    run: str = typer.Option(..., help="Primary run_id (its first 8 chars name the upload)"),
    extra_run: Annotated[
        list[str] | None,
        typer.Option("--extra-run", help="Further run_id(s) covering other weeks"),
    ] = None,
    season: int = typer.Option(2026),
    week: int = typer.Option(4, help="Week in the slate_id (<season>_<week>_<slate>)"),
    lineups: int = typer.Option(20),
    min_diff: int = typer.Option(3, help="Min players that differ between any two lineups"),
    max_exposure: float = typer.Option(0.5, help="Max share of lineups containing one player"),
    seed: int = typer.Option(7),
):
    """Standalone classic optimizer over several runs. Means only: no field sim, ownership, or DB write."""
    from .dfs import cross_slate as cs

    slate_id = f"{season}_{week:02d}_{slate}"
    run_ids = [run, *(extra_run or [])]
    try:
        pool, sources = cs.load_pool(slate_id, run_ids)
        lus = cs.optimize(pool.players, lineups, min_diff=min_diff,
                          max_exposure=max_exposure, seed=seed)
        paths = cs.write_outputs(cs.out_dir_for(slate_id), slate_id, run_ids, lus,
                                 salary_rows=pool.salary_rows)
    except RuntimeError as e:
        typer.echo(str(e))
        raise typer.Exit(1) from e
    for (a, h), s in sources.items():
        typer.echo(f"  {a}@{h}: run {str(s['run_id'])[:8]} week {s['week']}")
    for label, rows in (("dropped OUT", pool.dropped), ("unmatched", pool.unmatched),
                        ("unprojected", pool.unprojected)):
        for r in rows:
            typer.echo(f"  {label}: {r.get('name')} team={r.get('team')} pos={r.get('position')}")
    for k, lu in enumerate(lus, 1):
        typer.echo(f"{k:>2} ${lu['salary']} {lu['proj_fpts']:6.2f}  {lu['stack']:<22} "
                   + " | ".join(lu["names"]))
    typer.echo(f"dfs-cross {slate_id}: {len(lus)} lineups, upload {paths['upload']}")


@app.command("own-compare")
def own_compare(
    rts: str = typer.Option(..., "--rts", help="RTS CSV with an Own column"),
    run: str = typer.Option(..., "--run", help="run_id (or unique prefix) under data/dfs"),
    slate: str = typer.Option(..., "--slate"),
    site: str = typer.Option("dk"),
    top: int = typer.Option(10, "--top", help="Rows in each top / miss list"),
):
    """Compare our projected Own% to an RTS Own column. Read-only; never the sim."""
    from pathlib import Path

    from .benchmark import own_compare as oc
    from .ingest import names as N
    from .ingest.overrides import load_catalog

    try:
        slate_dir = oc.find_slate_dir(run, slate, site)
        r = oc.compare(
            oc.parse_rts_own(Path(rts)), oc.read_ours(slate_dir),
            load_catalog(), N.load_aliases(), N.load_teams(), top_n=top,
        )
    except ValueError as e:
        typer.echo(f"error: {e}")
        raise typer.Exit(code=1) from None
    typer.echo(f"own-compare {slate_dir}")
    for line in oc.format_report(r):
        typer.echo(line)


benchmark_app = typer.Typer(help="Third-party benchmark ingests (never the sim).")
app.add_typer(benchmark_app, name="benchmark")


@benchmark_app.command("nflgamesim")
def benchmark_nflgamesim(
    season: int = typer.Option(...),
    week: int = typer.Option(None, help="Required except for a multi-week page paste"),
    file: str = typer.Option(None, "--file", help="Pasted mygamesim page text"),
    refresh_actuals: bool = typer.Option(
        False, "--refresh-actuals", help="Fill finals from raw.schedules; rewrite CSV + upsert"),
):
    """Parse a mygamesim paste to data/benchmarks + raw.external_games.

    A paste with 'NFL Predictions for Week N' headers (the whole page, any number of weeks) is
    ingested for every week in it, or only --week; finals and the site-vs-ours check come with it.
    """
    from pathlib import Path

    from .benchmark import nflgamesim as ngs

    if file is None and not refresh_actuals:
        raise typer.BadParameter("--file is required unless --refresh-actuals")
    is_page = file is not None and ngs.WEEK_HEADER_RE.search(Path(file).read_text()) is not None
    if week is None and not is_page:
        raise typer.BadParameter("--week is required unless --file is a multi-week page paste")
    try:
        if is_page:
            for r in ngs.run_page(season, Path(file), week):
                typer.echo(
                    f"nflgamesim {r['season']} wk{r['week']}: "
                    f"{r['written']} written / {r['rows']} rows, {r['final']} final -> {r['csv']}"
                )
                if r["final"]:
                    o, s = r["ours"], r["site"]
                    site = (f"pick {s['pick']} / margin {s['margin']} / ats {s['ats']}"
                            if s else "no summary in paste")
                    typer.echo(
                        f"  ours  pick {o['pick']} / margin {o['margin']} / ats {o['ats']}"
                        f" of {r['final']} | site {site}"
                    )
                for m in r["mismatches"]:
                    typer.echo(f"  differs: {m}")
        elif file is not None:
            r = ngs.run(season, week, Path(file))
            typer.echo(
                f"nflgamesim {r['season']} wk{r['week']}: "
                f"{r['written']} written / {r['rows']} rows -> {r['csv']}"
            )
        if refresh_actuals and week is not None:
            r = ngs.refresh(season, week)
            typer.echo(
                f"nflgamesim refresh {r['season']} wk{r['week']}: "
                f"{r['final']} final / {r['rows']} rows, {r['written']} written"
            )
    except (ngs.UnmatchedGame, ValueError) as e:
        typer.echo(f"error: {e}")
        raise typer.Exit(code=1) from None


@benchmark_app.command("rts")
def benchmark_rts(
    season: int = typer.Option(...),
    week: int = typer.Option(...),
    file: str = typer.Option(None, "--file", help="RTS projection CSV"),
):
    """Load RTS projected points into raw.external_players (benchmark only)."""
    from pathlib import Path

    from .benchmark import rts_players as rp

    try:
        r = rp.run(season, week, Path(file) if file else None)
    except ValueError as e:
        typer.echo(f"error: {e}")
        raise typer.Exit(code=1) from None
    typer.echo(
        f"rts {r['season']} wk{r['week']}: "
        f"{r['written']} written / {r['rows']} rows, "
        f"{r['matched']} matched, {r['unmatched_n']} unmatched"
    )
    for u in r["unmatched"]:
        typer.echo(f"  {u['reason']}: {u['name']} team={u['team']}")


@benchmark_app.command("fantasypros")
def benchmark_fantasypros(
    season: int = typer.Option(...),
    week: int = typer.Option(...),
):
    """One FantasyPros projections pull into raw.fantasypros_snapshots + raw.external_players."""
    from .benchmark import fantasypros as fpb
    from .ingest.fantasypros import FantasyProsError

    try:
        r = fpb.run(season, week)
    except (FantasyProsError, RuntimeError) as e:
        typer.echo(f"error: {e}")
        raise typer.Exit(code=1) from None
    typer.echo(
        f"fantasypros {r['season']} wk{r['week']}: {r['calls']} call, "
        f"{r['snapshots']} snapshot rows, {r['written']} written / {r['rows']} rows, "
        f"{r['matched']} matched, {r['unmatched_n']} unmatched, "
        f"{r['key_collisions_dropped']} key collisions"
    )
    for u in r["unmatched"]:
        typer.echo(f"  {u['reason']}: {u['name']} team={u['team']} pos={u['position']}")


@benchmark_app.command("nflgamesim-players")
def benchmark_nflgamesim_players(
    season: int = typer.Option(...),
    week: int = typer.Option(...),
    file: str = typer.Option(None, "--file", help="NFLGameSim weekly player CSV"),
):
    """Load an NFLGameSim player CSV into raw.external_players (benchmark only)."""
    from pathlib import Path

    from .benchmark import nflgamesim_players as ngp
    from .ingest.odds_api import UnmappedTeam

    try:
        r = ngp.run(season, week, Path(file) if file else None)
        typer.echo(
            f"nflgamesim-players {r['season']} wk{r['week']}: "
            f"{r['written']} written / {r['rows']} rows, "
            f"{r['matched']} matched, {r['unmatched_n']} unmatched, "
            f"{r['games_unresolved_n']} unresolved games"
        )
        for u in r["unmatched"]:
            typer.echo(f"  {u['reason']}: {u['name']} team={u['team']} opp={u['opponent']}")
        for g in r["games_unresolved"]:
            typer.echo(
                f"  unresolved game ({g['hits']} hits): {g['name']} "
                f"team={g['team']} opp={g['opponent']}"
            )
    except (UnmappedTeam, ValueError) as e:
        typer.echo(f"error: {e}")
        raise typer.Exit(code=1) from None


@app.command()
def bettingpros(
    week: int = typer.Option(...),
    season: int = typer.Option(2026),
    file: str = typer.Option(None, "--file", help="Smart Money xlsx or a directory of them"),
    api: bool = typer.Option(False, "--api", help="Pull GET /v3/props for this NFL week"),
):
    """Ingest BettingPros player props into model.market_props. No edges."""
    from pathlib import Path

    from .market import bettingpros as bp

    if api == (file is not None):
        typer.echo("error: pass --file or --api")
        raise typer.Exit(code=1)
    if api:
        try:
            r = bp.run_api(season, week)
        except bp.BettingProsError as e:
            typer.echo(f"error: {e}")
            raise typer.Exit(code=1) from None
        typer.echo(
            f"bettingpros api {r['season']} wk{r['week']}: "
            f"{r['written']} written, {r['n_joined']} matched, {len(r['unmatched'])} unmatched"
        )
        if r["rejected_markets"]:
            parts = ", ".join(f"{m['market']} {m['n']}" for m in r["rejected_markets"])
            typer.echo(f"    rejected markets: {parts}")
        for u in r["unmatched"]:
            typer.echo(
                f"    {u.get('reason', 'unmatched')}: {u.get('player')} fp={u.get('fp_id')}"
            )
        if r["stopped"]:
            typer.echo("stopped: nothing written")
            raise typer.Exit(code=1)
        return

    r = bp.run(season, week, Path(file))
    typer.echo("fair_props stats: " + " ".join(r["fair_stats"]))
    typer.echo(f"{r['n_selection']} Selection")
    typer.echo(f"  {r['n_team']} team (Game set)")
    typer.echo(f"  {r['n_player']} player props")
    typer.echo(f"    {r['n_mapped']} map to a fair_props stat")
    if r["rejected_markets"]:
        parts = ", ".join(f"{m['market']} {m['n']}" for m in r["rejected_markets"])
        typer.echo(f"    rejected markets: {parts}")
    typer.echo(f"    {r['n_joined']} survive name+team roster join")
    for u in r["rejected_roster"]:
        typer.echo(
            f"    {u.get('reason', 'unmatched')}: {u.get('player')} "
            f"pos={u.get('pos')} team={u.get('team')}"
        )
    if r["stopped"]:
        typer.echo(f"stopped: {r['n_joined']} survivors < {bp.MIN_SURVIVORS}; nothing written")
        return
    typer.echo(f"    {r['written']} written")


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
    if any(s.get("reason") == "draws_pruned" for s in edges["skipped"]):
        typer.echo("draws pruned for this run")
    for s in edges["skipped"]:
        typer.echo(
            f"  {s.get('reason')}: {s.get('player_name')} {s.get('stat')} {s.get('line')}"
        )


@app.command()
def actuals(
    week: int = typer.Option(...),
    season: int = typer.Option(2026),
):
    """Rebuild model.slate_actuals, then write actual_fpts for lineups whose games are all final."""
    from .results import dfs_grade

    graded = dfs_grade.run(season, week)
    built = graded["actuals"]
    typer.echo(
        f"actuals week {week}: {built['players']} players, {built['written']} updated, "
        f"{graded['n_complete']} lineups final, {graded['n_partial']} partial"
    )
    if graded.get("open_games"):
        typer.echo("  open: " + ", ".join(graded["open_games"]))
    if built["flagged"]:
        typer.echo("  recon flagged: " + ", ".join(built["flagged"]))


@app.command("actuals-live")
def actuals_live(season: int = typer.Option(2026)):
    """Scoreboard check. Exit when nothing is live. Otherwise refresh live rows and actuals."""
    from datetime import UTC, datetime

    from .ingest import espn_live
    from .results import dfs_grade
    from .workflow import board_week

    now = datetime.now(UTC)
    if not espn_live.in_game_window(now):
        typer.echo("outside game window")
        return
    try:
        board = espn_live.fetch_json(espn_live.SCOREBOARD)
        games = espn_live.parse_scoreboard(board)
    except (ConnectionError, espn_live.SchemaError) as e:
        typer.echo(f"scoreboard failed ({e})")
        return
    week = board_week(season) or (games[0]["week"] if games else None)
    if week is None:
        typer.echo("no week")
        return
    games = [g for g in games if g["season"] == season and g["week"] == week]
    existing = espn_live._existing(season, week)
    if not espn_live.should_pull(games, existing, now):
        typer.echo("no live game")
        return
    live = espn_live.run(season, week, now=now)
    graded = dfs_grade.run(season, week)
    typer.echo(
        f"actuals-live week {week}: box {len(live['written'])}, "
        f"players {graded['actuals']['written']}, lineups {graded['n_complete']} final"
    )


@app.command()
def grade(
    week: int = typer.Option(...),
    season: int = typer.Option(2026),
    run: str = typer.Option(None, help="run_id (default: newest run before each game's kickoff)"),
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
    for skip in (report.elo or {}).get("skipped") or []:
        typer.echo(f"  elo {skip['reason']}: {skip['game_id']}")
    for a in report.assignments:
        typer.echo(
            f"  {a['game_id']} → {a['run_id'][:8]} created {a['created_at']} "
            f"kickoff {a['kickoff']} predated={a['predated_kickoff']}"
        )
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
        typer.echo(
            f"dfs: {dfs['n_lineups']} lineups, {dfs.get('n_complete', 0)} graded, "
            f"{dfs.get('n_partial', dfs.get('n_incomplete', 0))} partial"
        )
        if dfs.get("open_games"):
            typer.echo("  open: " + ", ".join(dfs["open_games"]))
        if dfs.get("missing"):
            typer.echo("dfs missing actuals: " + ", ".join(
                f"{k} x{v}" for k, v in list(dfs["missing"].items())[:10]))
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
    # Before prune: DK p50 and pass attempts for the table come from draw parquet.
    from .results import player_proj_actual as PPA

    ppa = PPA.refresh_week(season, week)
    if ppa["skipped"]:
        typer.echo(f"player_proj_actual: skipped ({ppa['reason']})")
    else:
        typer.echo(f"player_proj_actual: {ppa['n_rows']} players, {ppa['with_parquet']} with DK p50")
        PPA.write_report(season)

    from .results import jev_grade as JG

    try:
        jg = JG.run(season, week, slate="main")
        if jg["n_players"] > 0:
            typer.echo(f"grade-jev {season} wk{week} main: {jg['n_players']} pre-kickoff audited players graded")
            for v in jg["verdicts"]:
                typer.echo(
                    f"  {v['verdict']:<8} n={v['players']:<3} "
                    f"resid={v['mean_residual_dk']:+6.2f if v['mean_residual_dk'] is not None else '     -'} "
                    f"snap={v['mean_realized_snap_pct'] if v['mean_realized_snap_pct'] is not None else 0.0:.2f} "
                    f"dnp={v['dnp_rate']:.1%}"
                )
    except (RuntimeError, ValueError, OSError) as e:
        typer.echo(f"grade-jev: skipped ({e})")

    from .rebuild import prune_draws

    for line in prune_draws(season=season, week=week):
        typer.echo(line)


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


@app.command("player-bias")
def player_bias(
    season: int = typer.Option(2026),
    week: str = typer.Option(
        "", "--week", help="Build model.player_proj_actual first for these weeks, e.g. 3 or 1,2,3"),
):
    """Projected vs actual DK bias by position, tier, and usage channel. Diagnostic only."""
    from .results import player_proj_actual as P

    for w in sorted({int(x) for x in week.split(",") if x.strip()}):
        out = P.refresh_week(season, w)
        if out["skipped"]:
            typer.echo(f"week {w}: skipped ({out['reason']})")
        else:
            typer.echo(
                f"week {w}: {out['n_rows']} rows; {out['with_parquet']} with parquet "
                f"(DK p50 and attempts null for the rest); "
                f"{len(out['games_without_run'])} games had no projection"
                + (
                    f"; {len(out['games_after_kickoff'])} used the earliest post-kickoff run"
                    if out.get("games_after_kickoff") else ""
                )
            )
    path, rep = P.write_report(season)
    typer.echo(
        f"weeks {rep['weeks'] or 'none'}: {rep['n_players']} players compared, "
        f"{rep['did_not_play']} projected but did not play"
    )
    for c in rep["candidates"]:
        typer.echo(f"  candidate {c['dimension']} / {c['label']}: {c['mean_resid']:+.2f} -> {c['owner']}")
    if not rep["candidates"]:
        typer.echo("no cell passes the gate; no prior change is eligible")
    typer.echo(path)


@app.command("grade-jev")
def grade_jev_cmd(
    week: int = typer.Option(..., help="Completed NFL week to grade"),
    season: int = typer.Option(2026),
    slate: str = typer.Option("main", help="DFS slate key"),
):
    """Grade pre-kickoff Jev lineup audit verdicts against realized DK points and snap share."""
    from .results import jev_grade as JG

    r = JG.run(season, week, slate=slate)
    typer.echo(
        f"grade-jev {r['season']} wk{r['week']} {r['slate']}: {r['n_players']} pre-kickoff audited players with final actuals"
    )
    if not r["verdicts"]:
        typer.echo("  no pre-kickoff audited rows with final actuals")
        return
    for v in r["verdicts"]:
        typer.echo(
            f"  {v['verdict']:<8} n={v['players']:<3} "
            f"proj={v['mean_proj_dk'] if v['mean_proj_dk'] is not None else '-':>6} "
            f"actual={v['mean_actual_dk'] if v['mean_actual_dk'] is not None else '-':>6} "
            f"resid={v['mean_residual_dk']:+6.2f if v['mean_residual_dk'] is not None else '     -'} "
            f"snap={v['mean_realized_snap_pct'] if v['mean_realized_snap_pct'] is not None else 0.0:.2f} "
            f"dnp={v['dnp_rate']:.1%}"
        )
    for q in r["questions"]:
        if q["n_triggered"] > 0:
            typer.echo(
                f"  q:{q['question_id']:<28} trig={q['n_triggered']} "
                f"(resid={q['trig_mean_residual']:+.2f}) vs clear={q['n_cleared']} "
                f"(resid={q['clear_mean_residual'] or 0.0:+.2f})"
            )



research_app = typer.Typer(help="Research Lab: as-of player fields scored by user-defined metrics.")
app.add_typer(research_app, name="research")


@research_app.command("build")
def research_build(
    week: int = typer.Option(..., help="Target week; reads only weeks before it"),
    season: int = typer.Option(2026),
):
    """Build model.research_fields for (season, week) from rows before that week. All or nothing."""
    from .research import fields as F

    try:
        n = F.run(season, week)
    except F.ResearchDataMissing as e:
        typer.echo(f"error: {e}")
        raise typer.Exit(code=1) from None
    typer.echo(f"research fields {season} week {week}: {n} players (as-of: before week {week})")


@research_app.command("audit")
def research_audit(
    week: int = typer.Option(..., help="NFL week"),
    season: int = typer.Option(2026),
    slate: str = typer.Option("main", help="DFS slate key (main, full, ...)"),
    site: str = typer.Option("dk"),
    limit: int = typer.Option(60, help="Max players to evaluate on the slate"),
    max_usd: float = typer.Option(0.10, "--max-usd", help="Hard USD cap for the run"),
    dry_run: bool = typer.Option(False, "--dry-run", help="Print cost and cache status; make zero API calls"),
    as_of: str = typer.Option(None, "--as-of", help="Optional UTC ISO timestamp cutoff (default: game kickoff)"),
):
    """Run Jev qualitative lineup audit over the slate player pool and append to model.jev_judgments."""
    from datetime import datetime

    from .research import audit as A
    from .research.jev_client import JevAuditError

    cutoff_dt = datetime.fromisoformat(as_of) if as_of else None
    try:
        r = A.run_audit(
            season=season,
            week=week,
            slate=slate,
            site=site,
            limit=limit,
            max_usd=max_usd,
            dry_run=dry_run,
            as_of=cutoff_dt,
        )
    except (JevAuditError, RuntimeError, ValueError) as e:
        typer.echo(f"error: {e}")
        raise typer.Exit(code=1) from None

    est = r["estimate"]
    mode = "dry-run " if r["dry_run"] else ""
    typer.echo(
        f"{mode}research audit {r['season']} wk{r['week']} {r['slate']}: "
        f"{est.players_total} players ({est.players_cached} cached, {est.players_no_read} no_read, "
        f"{est.players_to_call} to call), est {est.est_input_tokens} tok (${est.est_usd:.4f})"
    )
    if not r["dry_run"]:
        models = ", ".join(r["models_resolved"]) if r["models_resolved"] else r["model_requested"]
        typer.echo(
            f"  wrote {r['written_rows']} judgment rows, actual {r['actual_input_tokens']} tok "
            f"(${r['actual_usd']:.4f}), model={models}"
        )
    vc = r["verdict_counts"]
    typer.echo(
        f"  verdicts: KEEP={vc.get('KEEP', 0)} FLAG={vc.get('FLAG', 0)} "
        f"VETO={vc.get('VETO', 0)} NO_READ={vc.get('NO_READ', 0)}"
    )
    for p in r["players"]:
        if p["verdict"] in ("VETO", "FLAG") or p["boost"]:
            tag = f"{p['verdict']}{'+BOOST' if p['boost'] else ''}"
            typer.echo(
                f"  [{tag}] {p['name']} ({p['position']} {p['team']} ${p['salary']}): "
                + "; ".join(p["reasons"])
            )



if __name__ == "__main__":
    app()
