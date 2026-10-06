"""FantasyPros weekly NFL projections -> raw.fantasypros_snapshots + raw.external_players.

Every pull inserts snapshot rows keyed by one `fetched_at` (never overwritten, so a later backtest
can read only what existed before a run's cutoff); the latest values upsert into
raw.external_players with source='fantasypros'. Stats are stored as the API returns them: fpts_std
and fpts_ppr are FantasyPros points. fpts_dk is the same stat means scored with config/scoring.yaml
DK rules (see dk_points): the API has no DK scoring of its own.
Benchmark only until promoted (AGENTS.md); nothing in sim/ or priors/ reads these tables.
Unmatched players are kept with a null player_id and reported, never dropped.
"""
from __future__ import annotations

import json
from datetime import UTC, datetime

import polars as pl

from ..ingest import fantasypros_match as M
from ..ingest import names as N

SOURCE = "fantasypros"
KEY_COLS = ["source", "season", "week", "name", "team"]
SNAPSHOT_KEY = ["endpoint", "season", "week", "fetched_at", "fp_id"]

# API stat key -> external_players column
STAT_MAP = {
    "pass_att": "pass_att",
    "pass_cmp": "pass_cmp",
    "pass_yds": "pass_yds",
    "pass_tds": "pass_td",
    "pass_ints": "pass_int",
    "rush_att": "rush_att",
    "rush_yds": "rush_yds",
    "rush_tds": "rush_td",
    "rec_rec": "rec",
    "rec_yds": "rec_yds",
    "rec_tds": "rec_td",
    "points": "fpts_std",
    "points_ppr": "fpts_ppr",
}
STAT_COLS = list(STAT_MAP.values())

EXTERNAL_SCHEMA = {
    "source": pl.Utf8,
    "season": pl.Int64,
    "week": pl.Int64,
    "player_id": pl.Utf8,
    "name": pl.Utf8,
    "team": pl.Utf8,
    "opponent": pl.Utf8,
    "game_id": pl.Utf8,
    **{c: pl.Float64 for c in STAT_COLS},
    "fpts_dk": pl.Float64,
}

SNAPSHOT_SCHEMA = {
    "endpoint": pl.Utf8,
    "season": pl.Int64,
    "week": pl.Int64,
    "fetched_at": pl.Datetime(time_zone="UTC"),
    "fp_id": pl.Utf8,
    "player_id": pl.Utf8,
    "name": pl.Utf8,
    "team": pl.Utf8,
    "position": pl.Utf8,
    "payload": pl.Utf8,
}


def _num(v) -> float | None:
    try:
        return None if v is None else float(v)
    except (TypeError, ValueError):
        return None


def dk_points(stats: dict, rules: dict) -> float:
    """Expected DK points from FantasyPros stat means, scored with config/scoring.yaml (`dk`).

    `pass_yds_300`, `rush_yds_100` and `rec_yds_100` are FantasyPros' expected counts of a bonus
    game (a probability), so each bonus is probability x bonus points rather than a threshold on
    the mean. `fumbles` is fumbles lost: FantasyPros' own STD points reproduce only when it is
    scored at -2 (see test_fp_points_identity). `ret_tds` are return TDs at 6, as results/actuals.py
    adds them to realized points. This converts an external projection for display; it is not a sim.
    """
    def g(key: str) -> float:
        return _num(stats.get(key)) or 0.0

    return (
        g("pass_yds") * rules["pass_yd"] + g("pass_tds") * rules["pass_td"]
        + g("pass_ints") * rules["int"] + g("pass_yds_300") * rules.get("pass_300_bonus", 0)
        + g("rush_yds") * rules["rush_yd"] + g("rush_tds") * rules["rush_td"]
        + g("rush_yds_100") * rules.get("rush_100_bonus", 0)
        + g("rec_rec") * rules["rec"] + g("rec_yds") * rules["rec_yd"] + g("rec_tds") * rules["rec_td"]
        + g("rec_yds_100") * rules.get("rec_100_bonus", 0)
        + g("fumbles") * rules["fumble_lost"] + g("2pt_tds") * rules["two_pt"]
        + g("ret_tds") * 6
    )


def project_rows(resp: dict, fp_map: dict[str, str], catalog: pl.DataFrame,
                 aliases: dict[str, str], teams: dict,
                 dk_rules: dict | None = None) -> tuple[list[dict], list[dict]]:
    """Map the projections response to rows + the unmatched list. Pure given dk_rules."""
    if dk_rules is None:
        from ..config import load_yaml

        dk_rules = load_yaml("scoring.yaml")["dk"]
    prepared = catalog if "_dn" in catalog.columns else N.prepare_catalog(catalog)
    rows, unmatched = [], []
    for p in resp["players"]:
        stats = p.get("stats") or {}
        name = str(p.get("name") or "").strip()
        team = N.normalize_team(p.get("team_id"), teams) or ""
        pos = p.get("position_id")
        m = M.match_player(p.get("fpid"), name, team, pos, fp_map, prepared, aliases, teams)
        row = {
            "source": SOURCE,
            "fp_id": str(p.get("fpid")),
            "name": name,
            "team": team,
            "position": pos,
            "player_id": m.player_id,
            "match_reason": m.reason or "matched",
            "stats": stats,
            **{col: _num(stats.get(key)) for key, col in STAT_MAP.items()},
            "fpts_dk": dk_points(stats, dk_rules) if stats else None,
        }
        rows.append(row)
        if m.player_id is None:
            unmatched.append({"name": name, "team": team, "position": pos,
                              "reason": m.reason or "unmatched"})
    return rows, unmatched


def to_external_frame(rows: list[dict], season: int, week: int) -> tuple[pl.DataFrame, int]:
    """raw.external_players frame, one row per (name, team); the larger PPR projection wins a key
    collision. Returns (frame, rows dropped by that rule)."""
    recs = [{
        "source": SOURCE, "season": season, "week": week,
        "player_id": r["player_id"], "name": r["name"], "team": r["team"],
        "opponent": None, "game_id": None,
        **{c: r.get(c) for c in STAT_COLS},
        "fpts_dk": r.get("fpts_dk"),
    } for r in rows]
    if not recs:
        return pl.DataFrame(schema=EXTERNAL_SCHEMA), 0
    df = pl.DataFrame(recs, schema=EXTERNAL_SCHEMA)
    out = (df.sort("fpts_ppr", descending=True, nulls_last=True)
             .unique(subset=KEY_COLS, keep="first", maintain_order=True))
    return out, df.height - out.height


def to_snapshot_frame(rows: list[dict], endpoint: str, season: int, week: int,
                      fetched_at: datetime, payload_key: str = "stats") -> pl.DataFrame:
    recs = [{
        "endpoint": endpoint, "season": season, "week": week, "fetched_at": fetched_at,
        "fp_id": r["fp_id"], "player_id": r["player_id"], "name": r["name"],
        "team": r["team"], "position": r.get("position"),
        "payload": json.dumps(r[payload_key], sort_keys=True),
    } for r in rows]
    if not recs:
        return pl.DataFrame(schema=SNAPSHOT_SCHEMA)
    return (pl.DataFrame(recs, schema=SNAPSHOT_SCHEMA)
            .unique(subset=SNAPSHOT_KEY, keep="first", maintain_order=True))


def run(season: int, week: int, client=None) -> dict:
    """One projections pull. Fails closed before any write if the API answer is not usable."""
    from ..ingest.fantasypros import Client

    client = client or Client()
    resp = client.projections(season, week)  # raises FantasyProsError; nothing written yet
    fetched_at = datetime.now(UTC)

    from ..db import insert, upsert
    from ..ingest.overrides import load_catalog

    rows, unmatched = project_rows(
        resp, M.load_fp_map(), load_catalog(), N.load_aliases(), N.load_teams(),
    )
    ext, dropped = to_external_frame(rows, season, week)
    snap = to_snapshot_frame(rows, "projections", season, week, fetched_at)
    snap_n = insert(snap, "raw.fantasypros_snapshots")
    ext_n = upsert(ext, "raw.external_players", KEY_COLS)
    return {
        "season": season,
        "week": week,
        "calls": client.calls,
        "rows": len(rows),
        "snapshots": snap_n,
        "written": ext_n,
        "key_collisions_dropped": dropped,
        "matched": sum(1 for r in rows if r["player_id"]),
        "unmatched_n": len(unmatched),
        "unmatched": unmatched,
        "fetched_at": fetched_at.isoformat(),
    }
