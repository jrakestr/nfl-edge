"""FantasyPros weekly rankings (ECR) -> raw.fantasypros_snapshots, as-of by fetched_at.

This does not write raw.ff_rankings_weekly: that stays the nflreadpy archive (backfill). Snapshots
exist so a week-W backtest can read only the ranks that were visible before a run's cutoff.
Benchmark only until promoted (AGENTS.md); nothing in sim/ or priors/ reads this table.
"""
from __future__ import annotations

from datetime import UTC, datetime

import polars as pl

from ..benchmark import fantasypros as B
from . import fantasypros_match as M
from . import names as N

POSITIONS = frozenset({"QB", "RB", "WR", "TE", "K", "DST"})


def rank_rows(resp: dict, fp_map: dict[str, str], catalog: pl.DataFrame,
              aliases: dict[str, str], teams: dict) -> tuple[list[dict], list[dict]]:
    prepared = catalog if "_dn" in catalog.columns else N.prepare_catalog(catalog)
    rows, unmatched = [], []
    for p in resp["players"]:
        pos = p.get("position_id")
        if pos not in POSITIONS:
            continue
        name = str(p.get("player_name") or "").strip()
        team = N.normalize_team(p.get("team_id"), teams) or ""
        m = M.match_player(p.get("id"), name, team, pos, fp_map, prepared, aliases, teams)
        rows.append({
            "fp_id": str(p.get("id")), "name": name, "team": team, "position": pos,
            "player_id": m.player_id, "rank": p.get("rank") or {},
        })
        if m.player_id is None:
            unmatched.append({"name": name, "team": team, "position": pos,
                              "reason": m.reason or "unmatched"})
    return rows, unmatched


def run(season: int, week: int, client=None) -> dict:
    """One rankings pull. Fails closed before any write if the API answer is not usable."""
    from ..ingest.fantasypros import Client

    client = client or Client()
    resp = client.rankings(season, week)
    fetched_at = datetime.now(UTC)

    from ..db import insert
    from .overrides import load_catalog

    rows, unmatched = rank_rows(
        resp, M.load_fp_map(), load_catalog(), N.load_aliases(), N.load_teams(),
    )
    snap = B.to_snapshot_frame(rows, "rankings", season, week, fetched_at, payload_key="rank")
    n = insert(snap, "raw.fantasypros_snapshots")
    return {
        "season": season,
        "week": week,
        "calls": client.calls,
        "rows": len(rows),
        "snapshots": n,
        "matched": sum(1 for r in rows if r["player_id"]),
        "unmatched_n": len(unmatched),
        "unmatched": unmatched,
        "fetched_at": fetched_at.isoformat(),
    }
