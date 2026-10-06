"""Margin Elo. One number per team, in points.

A graded game moves the rating by K times (actual home margin − expected home margin).
Expected margin is the pre-kickoff run's mean_spread plus the rating gap that run
already used. Week W reads the last row with season < S or week < W.
"""
from __future__ import annotations

import re
from collections import defaultdict

import polars as pl

from ..config import ROOT
from ..db import read_sql, upsert
from . import common

K_GRID = (0.0, 0.05, 0.1, 0.15, 0.2, 0.3)
MAE_BAR = 0.15
UPDATE_KEY = ["game_id"]
RATING_KEY = ["team", "season", "week"]


def apply_update(r_home: float, r_away: float, actual_margin: float, expected_margin: float,
                 k: float) -> tuple[float, float]:
    error = float(actual_margin) - float(expected_margin)
    new_home = float(r_home) + float(k) * error
    return new_home, (float(r_home) + float(r_away)) - new_home


def ratings_as_of(rows: list[dict], season: int, week: int) -> dict[str, float]:
    """Latest rating per team from rows strictly before (season, week)."""
    best: dict[str, dict] = {}
    for row in rows:
        if row["season"] < season or (row["season"] == season and row["week"] < week):
            prev = best.get(row["team"])
            if prev is None or (row["season"], row["week"]) > (prev["season"], prev["week"]):
                best[row["team"]] = row
    return {team: float(row["rating"]) for team, row in best.items()}


def plan_week(games: list[dict], ratings: dict[str, float], k: float
              ) -> tuple[list[dict], list[dict], list[dict]]:
    """One week. Every game sees `ratings` from before the week. Null score or no
    predated run is named and not written. Does not mutate `ratings`."""
    base = {team: float(value) for team, value in ratings.items()}
    updates: list[dict] = []
    skipped: list[dict] = []
    delta: dict[str, float] = defaultdict(float)
    season = week = None
    for game in games:
        if game.get("actual_margin") is None:
            skipped.append({"game_id": game["game_id"], "reason": "no_score"})
            continue
        if game.get("run_id") is None or game.get("mean_spread") is None:
            skipped.append({"game_id": game["game_id"], "reason": "no_predated_run"})
            continue
        home, away = game["home_team"], game["away_team"]
        r_home = base.get(home, 0.0)
        r_away = base.get(away, 0.0)
        expected = float(game["mean_spread"]) + (r_home - r_away)
        new_home, new_away = apply_update(
            r_home, r_away, float(game["actual_margin"]), expected, k,
        )
        updates.append({
            "game_id": game["game_id"],
            "run_id": game["run_id"],
            "season": int(game["season"]),
            "week": int(game["week"]),
            "home_team": home,
            "away_team": away,
            "actual_margin": float(game["actual_margin"]),
            "expected_margin": expected,
            "k": float(k),
            "rating_home_before": r_home,
            "rating_away_before": r_away,
        })
        delta[home] += new_home - r_home
        delta[away] += new_away - r_away
        season, week = int(game["season"]), int(game["week"])
    if not updates:
        return [], [], skipped
    rows = [
        {"team": team, "season": season, "week": week, "rating": base.get(team, 0.0) + change}
        for team, change in sorted(delta.items())
    ]
    return updates, rows, skipped


def walk(games: list[dict], k: float, ratings: dict[str, float] | None = None
         ) -> tuple[list[dict], list[dict], list[dict], dict[str, float]]:
    """Weeks in order. A week with no update leaves the rating where it was."""
    state = {team: float(value) for team, value in (ratings or {}).items()}
    updates: list[dict] = []
    rows: list[dict] = []
    skipped: list[dict] = []
    groups: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for game in games:
        groups[(int(game["season"]), int(game["week"]))].append(game)
    for key in sorted(groups):
        week_updates, week_rows, week_skipped = plan_week(groups[key], state, k)
        updates.extend(week_updates)
        rows.extend(week_rows)
        skipped.extend(week_skipped)
        for row in week_rows:
            state[row["team"]] = row["rating"]
    return updates, rows, skipped, state


def mae(updates: list[dict]) -> float | None:
    if not updates:
        return None
    return sum(abs(u["actual_margin"] - u["expected_margin"]) for u in updates) / len(updates)


def choose_k(games_2024: list[dict], games_2025: list[dict]) -> dict:
    """Lowest 2024 actual-margin MAE. Keep it only if 2025 beats K=0 by more than MAE_BAR."""
    fitted: list[tuple[float, float]] = []
    end_2024: dict[float, dict[str, float]] = {}
    for k in K_GRID:
        updates, _rows, _skipped, state = walk(games_2024, k)
        score = mae(updates)
        if score is None:
            continue
        fitted.append((score, k))
        end_2024[k] = state
    if not fitted:
        return {"k": 0.0, "mae_2024": None, "mae_2025": None, "mae_2025_k0": None, "kept": False}
    _score, k_star = min(fitted, key=lambda item: (item[0], item[1]))
    mae_2025 = mae(walk(games_2025, k_star, end_2024.get(k_star, {}))[0])
    mae_k0 = mae(walk(games_2025, 0.0)[0])
    kept = (
        k_star > 0 and mae_2025 is not None and mae_k0 is not None
        and mae_k0 - mae_2025 > MAE_BAR
    )
    return {
        "k": k_star if kept else 0.0,
        "k_star": k_star,
        "mae_2024": _score,
        "mae_2025": mae_2025,
        "mae_2025_k0": mae_k0,
        "kept": kept,
    }


def load_ratings(season: int, week: int) -> dict[str, float]:
    df = read_sql(
        """
        select distinct on (team) team, rating::float8 as rating
        from model.team_elo
        where season < %s or (season = %s and week < %s)
        order by team, season desc, week desc
        """,
        (season, season, week),
    )
    if df.is_empty():
        return {}
    return {row["team"]: float(row["rating"]) for row in df.to_dicts()}


def _frame(rows: list[dict]) -> pl.DataFrame:
    return pl.DataFrame(rows).with_columns(
        pl.col("season").cast(pl.Int64),
        pl.col("week").cast(pl.Int64),
    )


def write_rows(updates: list[dict], rows: list[dict]) -> tuple[int, int]:
    n_updates = n_rows = 0
    if updates:
        frame = _frame(updates).with_columns(
            pl.col("actual_margin").cast(pl.Float64),
            pl.col("expected_margin").cast(pl.Float64),
            pl.col("k").cast(pl.Float64),
            pl.col("rating_home_before").cast(pl.Float64),
            pl.col("rating_away_before").cast(pl.Float64),
        )
        n_updates = upsert(frame, "model.elo_updates", UPDATE_KEY)
    if rows:
        frame = _frame(rows).with_columns(pl.col("rating").cast(pl.Float64))
        n_rows = upsert(frame, "model.team_elo", RATING_KEY)
    return n_updates, n_rows


def _schedule() -> pl.DataFrame:
    return read_sql(
        """
        select season, week, game_id, home_team, away_team,
               home_score::float8 as home_score, away_score::float8 as away_score,
               gameday, gametime, location
        from raw.schedules
        where game_type = 'REG' and season >= 2024
        order by season, week, game_id
        """
    )


def _projections() -> pl.DataFrame:
    return read_sql(
        """
        select r.run_id::text as run_id, r.created_at, p.game_id, p.mean_spread::float8 as mean_spread
        from model.sim_runs r
        join model.proj_games p on p.run_id = r.run_id
        where p.mean_spread is not null
        """
    )


def attach_runs(schedule: list[dict], projections: list[dict]) -> list[dict]:
    """Resolve each game to the newest pre-kickoff mean_spread. Missing run stays None."""
    from ..results.grade import kickoff_at, run_for_kickoff

    by_game: dict[str, list[dict]] = defaultdict(list)
    for row in projections:
        if row.get("mean_spread") is None:
            continue
        by_game[row["game_id"]].append(row)
    out = []
    for game in schedule:
        actual = None
        if game.get("home_score") is not None and game.get("away_score") is not None:
            actual = float(game["home_score"]) - float(game["away_score"])
        runs = by_game.get(game["game_id"], [])
        kick = kickoff_at(game.get("gameday"), game.get("gametime"), game.get("location"))
        run_id = run_for_kickoff(runs, kick)
        chosen = next((row for row in runs if row["run_id"] == run_id), None)
        out.append({
            "game_id": game["game_id"],
            "season": int(game["season"]),
            "week": int(game["week"]),
            "home_team": game["home_team"],
            "away_team": game["away_team"],
            "actual_margin": actual,
            "run_id": None if chosen is None else chosen["run_id"],
            "mean_spread": None if chosen is None else float(chosen["mean_spread"]),
        })
    return out


def load_games() -> list[dict]:
    sched = _schedule()
    proj = _projections()
    if sched.is_empty():
        return []
    return attach_runs(sched.to_dicts(), [] if proj.is_empty() else proj.to_dicts())


def k_from_config() -> float:
    return float(common.cfg().get("elo_k", 0.0))


def store_k(k: float) -> None:
    path = ROOT / "config" / "sim.yaml"
    text = path.read_text()
    line = (
        f"  elo_k: {k:g}             # margin Elo; 0 unless 2025 actual-margin MAE "
        f"beats K=0 by more than {MAE_BAR:g}\n"
    )
    if re.search(r"^  elo_k:", text, re.MULTILINE):
        text = re.sub(r"^  elo_k:.*\n", line, text, count=1, flags=re.MULTILINE)
    else:
        text = text.replace(
            "  qb_ppd_elasticity:",
            line + "  qb_ppd_elasticity:",
            1,
        )
    path.write_text(text)


def write_week(season: int, week: int, k: float | None = None) -> dict:
    """Grade hook. Reads ratings already stored before this week and upserts this week."""
    k = k_from_config() if k is None else float(k)
    games = [g for g in load_games() if g["season"] == season and g["week"] == week]
    updates, rows, skipped = plan_week(games, load_ratings(season, week), k)
    n_updates, n_rows = write_rows(updates, rows)
    return {"k": k, "updates": n_updates, "ratings": n_rows, "skipped": skipped}


def run_gate() -> dict:
    """Fit K on 2024, check 2025 once, store K, insert the full walk."""
    games = [g for g in load_games() if g["actual_margin"] is not None]
    g2024 = [g for g in games if g["season"] == 2024]
    g2025 = [g for g in games if g["season"] == 2025]
    choice = choose_k(g2024, g2025)
    store_k(choice["k"])
    updates, rows, skipped, _state = walk(games, choice["k"])
    n_updates, n_rows = write_rows(updates, rows)
    return {**choice, "written_updates": n_updates, "written_ratings": n_rows,
            "skipped": [s for s in skipped if s["reason"] != "no_score"],
            "games": len(games)}
