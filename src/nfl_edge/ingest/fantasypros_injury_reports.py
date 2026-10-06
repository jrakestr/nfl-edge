"""FantasyPros weekly injury reports -> raw.fantasypros_snapshots (endpoint 'injuries'), append-only.

One pull stores every row the API returns (status, injury type, practice days 1-3, probability of
playing, injury_update_date, IR weeks), practice-only rows included, stamped with one `fetched_at`.
Nothing is updated or deleted, and nothing here writes raw.player_overrides: that stays
`fantasypros_status`. The report for a past week is not a kickoff snapshot (it carries updates made
after the games), so a reader may treat a status as known before kickoff only when its
`injury_update_date` is on or before kickoff. Nothing in sim/ or priors/ reads this table.
"""
from __future__ import annotations

from datetime import UTC, datetime

import polars as pl

from ..benchmark import fantasypros as B
from . import fantasypros_match as M
from . import names as N

SKILL_POS = frozenset({"QB", "RB", "WR", "TE"})


def report_rows(resp: dict, fp_map: dict[str, str], catalog: pl.DataFrame, aliases: dict[str, str],
                teams: dict) -> tuple[list[dict], list[dict]]:
    """Every returned row as a snapshot row; unmatched skill-position players are reported, not dropped."""
    prepared = catalog if "_dn" in catalog.columns else N.prepare_catalog(catalog)
    rows, unmatched = [], []
    for x in resp["injuries"]:
        name = str(x.get("name") or "").strip()
        pos = N.normalize_pos(x.get("position_id"))
        team = N.normalize_team(x.get("team_id"), teams) or ""
        m = M.match_player(x.get("player_id"), name, team, pos, fp_map, prepared, aliases, teams)
        rows.append({"fp_id": str(x.get("player_id")), "name": name, "team": team,
                     "position": x.get("position_id"), "player_id": m.player_id, "payload": x})
        if m.player_id is None and pos in SKILL_POS:
            unmatched.append({"name": name, "team": team, "position": pos,
                              "reason": m.reason or "unmatched"})
    return rows, unmatched


def append_snapshot(resp: dict, season: int, week: int, fetched_at: datetime, fp_map: dict[str, str],
                    catalog: pl.DataFrame, aliases: dict[str, str], teams: dict) -> dict:
    from ..db import insert

    rows, unmatched = report_rows(resp, fp_map, catalog, aliases, teams)
    snap = B.to_snapshot_frame(rows, "injuries", season, week, fetched_at, payload_key="payload")
    n = insert(snap, "raw.fantasypros_snapshots")
    return {"rows": len(rows), "snapshots": n,
            "matched": sum(1 for r in rows if r["player_id"]),
            "unmatched": unmatched, "unmatched_n": len(unmatched)}


def run(season: int, week: int, client=None) -> dict:
    """One injuries pull. Fails closed before any write if the API answer is not usable."""
    from .fantasypros import Client
    from .overrides import load_catalog

    client = client or Client()
    resp = client.injuries(season, week)
    fetched_at = datetime.now(UTC)
    out = append_snapshot(resp, season, week, fetched_at, M.load_fp_map(), load_catalog(),
                          N.load_aliases(), N.load_teams())
    return {"season": season, "week": week, "calls": client.calls,
            "fetched_at": fetched_at.isoformat(), **out}
