"""Database side of `nfl-edge lines`: resolve the run, make sure its edges exist, assemble the
verdict inputs at the latest market snapshot, and persist one payload per game to model.verdicts.
The grammar itself lives in outputs/lines.py and never touches the database."""
from __future__ import annotations

import json

import polars as pl

from ..db import insert_ignore, read_sql
from ..market import edge
from . import lines


def resolve_run(season: int, week: int, run_id: str | None = None) -> dict:
    if run_id:
        df = read_sql("select run_id::text, season, week, draws_per_game from model.sim_runs where run_id = %s",
                      (run_id,))
    else:
        df = read_sql(
            "select run_id::text, season, week, draws_per_game from model.sim_runs "
            "where season = %s and week = %s order by created_at desc limit 1",
            (season, week),
        )
    if df.is_empty():
        raise RuntimeError(f"no sim run for season={season} week={week} run_id={run_id}")
    return df.row(0, named=True)


def load_games(run_id: str) -> list[dict]:
    """proj_games + schedule names + the latest market snapshot per game."""
    return read_sql(
        """
        with latest as (
          select distinct on (game_id) id, game_id, captured_at, spread_line, total_line,
                 home_moneyline, away_moneyline, home_spread_odds, away_spread_odds, over_odds, under_odds
          from raw.market_lines
          where game_id in (select game_id from model.proj_games where run_id = %s)
          order by game_id, captured_at desc
        )
        select p.game_id, s.home_team, s.away_team,
               (s.gameday::text || ' ' || coalesce(s.gametime, '')) as kickoff,
               p.fair_spread::float8 as fair_spread, p.fair_total::float8 as fair_total,
               p.home_win_prob::float8 as home_win_prob,
               l.id as market_line_id, l.captured_at::text as captured_at,
               l.spread_line::float8 as spread_line, l.total_line::float8 as total_line,
               l.home_spread_odds, l.away_spread_odds, l.over_odds, l.under_odds,
               l.home_moneyline, l.away_moneyline
        from model.proj_games p
        join raw.schedules s on s.game_id = p.game_id
        left join latest l on l.game_id = p.game_id
        where p.run_id = %s
        order by s.gameday, s.gametime, p.game_id
        """,
        (run_id, run_id),
    ).to_dicts()


def load_edges(run_id: str) -> list[dict]:
    return read_sql(
        """
        select market_line_id, ref_id, market_type, side, model_prob::float8 as model_prob,
               market_prob::float8 as market_prob, edge::float8 as edge,
               kelly_fraction::float8 as kelly_fraction, price, p_push::float8 as p_push, hold::float8 as hold
        from model.edges_latest where run_id = %s
        """,
        (run_id,),
    ).to_dicts()


def load_checks(run_id: str) -> list[dict]:
    return read_sql(
        "select game_id, severity, passed from model.sim_checks where run_id = %s and game_id is not null",
        (run_id,),
    ).to_dicts()


def build(season: int, week: int, run_id: str | None = None, recompute: bool = False) -> tuple[lines.WeekVerdicts, dict]:
    """Compute missing edges, then the week's verdicts. Returns (verdicts, edge-run stats)."""
    run = resolve_run(season, week, run_id)
    stats = edge.run(run["run_id"], recompute=recompute)
    w = lines.build_week(
        run["season"], run["week"], run["run_id"], int(run["draws_per_game"] or 0),
        load_games(run["run_id"]), load_edges(run["run_id"]), load_checks(run["run_id"]),
        lines.load_teams(), edge.cfg(),
    )
    return w, stats


def persist(w: lines.WeekVerdicts) -> int:
    """One row per game at the latest snapshot; games without a snapshot have no row yet."""
    payloads = w.to_dict()["games"]
    rows = [
        {"run_id": w.run_id, "game_id": g["game_id"], "market_line_id": int(g["market"]["snapshot_id"]),
         "payload": json.dumps(g)}
        for g in payloads if g["market"]["snapshot_id"] is not None
    ]
    if not rows:
        return 0
    return insert_ignore(pl.DataFrame(rows), "model.verdicts")


def edge_table(w: lines.WeekVerdicts, min_edge: float = 0.0) -> pl.DataFrame:
    rows = []
    for g in w.games:
        if g.status == "fail":
            continue
        for r in g.edges:
            if r["edge"] >= min_edge:
                rows.append({"game": f"{g.away}@{g.home}", "market": r["market_type"], "side": r["side"],
                             "model": r["model_prob"], "market_p": r["market_prob"], "edge": r["edge"],
                             "kelly": r["kelly_fraction"], "price": r["price"], "push": r["p_push"]})
    if not rows:
        return pl.DataFrame(schema={"game": pl.Utf8, "market": pl.Utf8, "side": pl.Utf8, "model": pl.Float64,
                                    "market_p": pl.Float64, "edge": pl.Float64, "kelly": pl.Float64,
                                    "price": pl.Int64, "push": pl.Float64})
    return pl.DataFrame(rows).sort("edge", descending=True)
