"""FantasyPros weekly PPR points -> raw.fantasypros_snapshots (endpoint 'player_points'), append-only.

One call covers every week in [start, end]; one snapshot row per offensive player-week (a 0.0 is kept:
the API cannot say whether that player played). Payload is {points, scoring}. League scoring differs
slightly from PPR, so readers compare, never gate. Nothing in sim/ or priors/ reads this table.
"""
from __future__ import annotations

from datetime import UTC, datetime

import polars as pl

from ..benchmark import fantasypros as B
from . import fantasypros_match as M
from . import names as N

OFFENSE = frozenset({"QB", "RB", "WR", "TE"})
SCORING = "PPR"


def points_rows(resp: dict, start: int, end: int, fp_map: dict[str, str], catalog: pl.DataFrame,
                aliases: dict[str, str], teams: dict) -> tuple[list[dict], list[dict]]:
    prepared = catalog if "_dn" in catalog.columns else N.prepare_catalog(catalog)
    scoring = str(resp.get("scoring") or SCORING)
    rows, unmatched = [], []
    for p in resp["players"]:
        pos = N.normalize_pos(p.get("position_id"))
        if pos not in OFFENSE:
            continue
        name = str(p.get("player_name") or "").strip()
        team = N.normalize_team(p.get("team_id"), teams) or ""
        m = M.match_player(p.get("player_id"), name, team, pos, fp_map, prepared, aliases, teams)
        if m.player_id is None:
            unmatched.append({"name": name, "team": team, "position": pos,
                              "reason": m.reason or "unmatched"})
        for wk, pts in (p.get("weeks") or {}).items():
            if not start <= int(wk) <= end or pts is None:
                continue
            rows.append({"fp_id": str(p.get("player_id")), "name": name, "team": team,
                         "position": pos, "player_id": m.player_id, "week": int(wk),
                         "payload": {"points": float(pts), "scoring": scoring}})
    return rows, unmatched


def run(season: int, start: int, end: int, client=None) -> dict:
    """One points pull. Fails closed before any call or write on a bad range or an unusable answer."""
    if not 1 <= start <= end:
        raise ValueError(f"start {start} and end {end} must satisfy 1 <= start <= end")
    from ..db import insert
    from .fantasypros import Client
    from .overrides import load_catalog

    client = client or Client()
    resp = client.player_points(season, start, end)
    fetched_at = datetime.now(UTC)
    rows, unmatched = points_rows(resp, start, end, M.load_fp_map(), load_catalog(),
                                  N.load_aliases(), N.load_teams())
    frames = [B.to_snapshot_frame([r for r in rows if r["week"] == w], "player_points", season, w,
                                  fetched_at, payload_key="payload")
              for w in sorted({r["week"] for r in rows})]
    snap = pl.concat(frames) if frames else B.to_snapshot_frame([], "player_points", season, start,
                                                                fetched_at)
    n = insert(snap, "raw.fantasypros_snapshots")
    return {"season": season, "start": start, "end": end, "calls": client.calls, "rows": len(rows),
            "snapshots": n, "matched": sum(1 for r in rows if r["player_id"]),
            "unmatched": unmatched, "unmatched_n": len(unmatched),
            "fetched_at": fetched_at.isoformat()}
