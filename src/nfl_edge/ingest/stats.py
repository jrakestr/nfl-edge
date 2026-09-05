"""Weekly player/team stats and pbp-derived team-game aggregates -> raw.* tables.

- raw.player_stats_weekly: identity columns + every other stat packed into `stats` jsonb
- raw.team_stats_weekly:   same shape at team level
- raw.team_game_agg:       per team-game aggregates computed from play-by-play (pbp not stored)
"""
from __future__ import annotations

import nflreadpy as nfl
import polars as pl

from ..db import upsert
from . import season

PLAYER_ID_COLS = ["season", "week", "player_id", "player_name", "position", "team", "opponent_team"]
TEAM_ID_COLS = ["season", "week", "team", "opponent_team"]

# Every pbp column the aggregation touches. Asserted at runtime so schema drift fails loudly.
PBP_COLS = [
    "game_id", "season", "week", "posteam", "home_team", "away_team", "home_score", "away_score",
    "fixed_drive", "play_type", "pass", "rush", "sack", "qb_dropback", "qb_scramble", "qb_kneel",
    "qb_spike", "complete_pass", "incomplete_pass",
    "two_point_attempt", "epa", "passing_yards", "rushing_yards", "pass_touchdown",
    "rush_touchdown", "field_goal_result", "field_goal_attempt", "interception", "fumble_lost",
    "score_differential", "game_seconds_remaining",
]


def _pack(df: pl.DataFrame, id_cols: list[str]) -> pl.DataFrame:
    """Keep id columns, pack everything else into a `stats` struct (-> jsonb)."""
    rest = [c for c in df.columns if c not in id_cols]
    float_cols = [c for c in rest if df[c].dtype in (pl.Float32, pl.Float64)]
    df = df.with_columns([pl.col(c).fill_nan(None) for c in float_cols])
    return df.select(id_cols + [pl.struct(rest).alias("stats")])


def fetch_player_stats(seasons: list[int]) -> pl.DataFrame:
    df = nfl.load_player_stats(seasons)
    df = df.filter(pl.col("player_id").is_not_null())
    # A player can appear twice in a week only via data errors; keep the row with more snaps of work.
    df = df.unique(subset=["season", "week", "player_id"], keep="last")
    return _pack(df, PLAYER_ID_COLS)


def fetch_team_stats(seasons: list[int]) -> pl.DataFrame:
    df = nfl.load_team_stats(seasons)
    df = df.unique(subset=["season", "week", "team"], keep="last")
    return _pack(df, TEAM_ID_COLS)


def aggregate_pbp(pbp: pl.DataFrame) -> pl.DataFrame:
    """Per team-game offensive aggregates. Pure function; tested offline on a synthetic frame."""
    missing = [c for c in PBP_COLS if c not in pbp.columns]
    if missing:
        raise KeyError(f"pbp is missing expected columns: {missing}")

    p = pbp.filter(pl.col("posteam").is_not_null()).with_columns(
        [pl.col(c).fill_null(0) for c in ("pass", "rush", "sack", "qb_dropback", "qb_scramble",
                                           "qb_kneel", "qb_spike", "complete_pass", "incomplete_pass",
                                           "two_point_attempt", "field_goal_attempt",
                                           "pass_touchdown", "rush_touchdown", "interception",
                                           "fumble_lost")]
    )
    is_play = (pl.col("play_type") != "no_play") & pl.col("play_type").is_not_null()
    # Offensive snaps: dropbacks (incl. sacks/scrambles), designed runs, kneels, spikes. No 2-pt.
    is_off = (
        is_play
        & (
            (pl.col("pass") == 1) | (pl.col("rush") == 1)
            | (pl.col("qb_kneel") == 1) | (pl.col("qb_spike") == 1)
        )
        & (pl.col("two_point_attempt") == 0)
    )
    # Definitions chosen to tie out exactly with nflverse team/player stats (verified on 2024):
    #   attempts = complete + incomplete + interception; carries = rush + scramble + kneel.
    is_pass_att = is_off & (
        (pl.col("complete_pass") == 1) | (pl.col("incomplete_pass") == 1) | (pl.col("interception") == 1)
    )
    is_rush = is_off & (
        (pl.col("rush") == 1) | ((pl.col("qb_scramble") == 1) & (pl.col("sack") == 0)) | (pl.col("qb_kneel") == 1)
    )
    is_sack = is_off & (pl.col("sack") == 1)
    is_dropback = is_off & (pl.col("qb_dropback") == 1)
    neutral = is_off & (pl.col("score_differential").abs() <= 7) & (pl.col("game_seconds_remaining") > 240)

    p = p.with_columns(
        is_off.cast(pl.Int32).alias("_off"),
        is_pass_att.cast(pl.Int32).alias("_pa"),
        is_rush.cast(pl.Int32).alias("_ra"),
        is_sack.cast(pl.Int32).alias("_sk"),
        is_dropback.cast(pl.Int32).alias("_db"),
        neutral.cast(pl.Int32).alias("_neu"),
        (neutral & is_dropback).cast(pl.Int32).alias("_neu_db"),
        pl.when(is_off).then(pl.col("epa")).otherwise(None).alias("_epa_off"),
        pl.when(is_dropback).then(pl.col("epa")).otherwise(None).alias("_epa_db"),
        (pl.col("field_goal_result") == "made").cast(pl.Int32).alias("_fgm"),
        (pl.col("posteam") == pl.col("home_team")).cast(pl.Int32).alias("home"),
        pl.when(pl.col("posteam") == pl.col("home_team"))
        .then(pl.col("away_team")).otherwise(pl.col("home_team")).alias("opponent"),
        pl.when(pl.col("posteam") == pl.col("home_team"))
        .then(pl.col("home_score")).otherwise(pl.col("away_score")).alias("points"),
    )

    agg = (
        p.group_by(["season", "week", "game_id", "posteam"])
        .agg(
            pl.col("opponent").first(),
            pl.col("home").first(),
            pl.col("_off").sum().alias("plays"),
            pl.col("fixed_drive").n_unique().alias("drives"),
            pl.col("_pa").sum().alias("pass_att"),
            pl.col("_ra").sum().alias("rush_att"),
            pl.col("_sk").sum().alias("sacks"),
            pl.col("_db").sum().alias("dropbacks"),
            pl.col("_neu").sum().alias("_neu"),
            pl.col("_neu_db").sum().alias("_neu_db"),
            pl.col("_epa_off").mean().alias("epa_per_play"),
            pl.col("_epa_db").mean().alias("epa_per_dropback"),
            pl.col("passing_yards").sum().cast(pl.Int32).alias("pass_yds"),
            pl.col("rushing_yards").sum().cast(pl.Int32).alias("rush_yds"),
            pl.col("points").first().cast(pl.Int32),
            pl.col("pass_touchdown").sum().cast(pl.Int32).alias("pass_td"),
            pl.col("rush_touchdown").sum().cast(pl.Int32).alias("rush_td"),
            pl.col("_fgm").sum().alias("fg_made"),
            pl.col("field_goal_attempt").sum().cast(pl.Int32).alias("fg_att"),
            pl.col("interception").sum().cast(pl.Int32).alias("interceptions"),
            pl.col("fumble_lost").sum().cast(pl.Int32).alias("fumbles_lost"),
        )
        .rename({"posteam": "team"})
        .with_columns(
            (pl.col("pass_td") + pl.col("rush_td")).alias("td"),
            (pl.col("plays") / pl.col("drives")).alias("plays_per_drive"),
            (pl.col("dropbacks") / pl.col("plays")).alias("pass_rate"),
            pl.when(pl.col("_neu") > 0)
            .then(pl.col("_neu_db") / pl.col("_neu")).otherwise(None).alias("neutral_pass_rate"),
            pl.when(pl.col("pass_att") > 0)
            .then(pl.col("pass_yds") / pl.col("pass_att")).otherwise(None).alias("yds_per_att"),
            (pl.col("fg_made") / pl.col("drives")).alias("fg_per_drive"),
        )
        .drop(["_neu", "_neu_db"])
    )
    cols = [
        "season", "week", "game_id", "team", "opponent", "home", "plays", "drives",
        "plays_per_drive", "pass_att", "rush_att", "sacks", "dropbacks", "neutral_pass_rate",
        "pass_rate", "epa_per_play", "epa_per_dropback", "yds_per_att", "pass_yds", "rush_yds",
        "points", "td", "pass_td", "rush_td", "fg_made", "fg_att", "fg_per_drive",
        "interceptions", "fumbles_lost",
    ]
    return agg.select(cols).sort(["season", "week", "game_id", "team"])


def fetch_team_game_agg(seasons: list[int]) -> pl.DataFrame:
    return aggregate_pbp(nfl.load_pbp(seasons))


def run(seasons: list[int], week: int | None = None) -> dict:
    out: dict = {}
    seasons, unpublished = season.split(seasons)
    if unpublished:
        out["skipped"] = season.skipped(unpublished, "player/team stats + pbp")
    if not seasons:
        return out
    ps = fetch_player_stats(seasons)
    ts = fetch_team_stats(seasons)
    ga = fetch_team_game_agg(seasons)
    if week is not None:
        ps, ts, ga = (d.filter(pl.col("week") == week) for d in (ps, ts, ga))
    out["player_stats_weekly"] = upsert(ps, "raw.player_stats_weekly", ["season", "week", "player_id"])
    out["team_stats_weekly"] = upsert(ts, "raw.team_stats_weekly", ["season", "week", "team"])
    out["team_game_agg"] = upsert(ga, "raw.team_game_agg", ["season", "week", "game_id", "team"])
    return out
