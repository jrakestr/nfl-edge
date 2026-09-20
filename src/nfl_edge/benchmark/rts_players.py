"""Load an RTS projection CSV into raw.external_players (benchmark only).

Nothing in sim/ reads this table. Projected points are stored as fpts_dk.
player_id comes from ingest.names.match_one; unmatched rows are kept with
null player_id and reported, never dropped.
"""
from __future__ import annotations

from pathlib import Path

import polars as pl

from ..config import ROOT
from ..ingest import rts_status as R

SOURCE = "rts"

KEY_COLS = ["source", "season", "week", "name", "team"]


def csv_path(season: int, week: int) -> Path:
    return ROOT / "data" / "benchmarks" / f"rts_projections_{season}_week{week:02d}.csv"


def from_rts(
    rts_rows: list[dict],
    catalog: pl.DataFrame,
    aliases: dict[str, str],
    teams: dict,
) -> tuple[list[dict], list[dict]]:
    """Map RTS parse rows to external_players records. Pure."""
    from ..ingest import names as N

    prepared = catalog if "_dn" in catalog.columns else N.prepare_catalog(catalog)
    out, unmatched = [], []
    for raw in rts_rows:
        name = str(raw.get("player") or "").strip()
        team = raw.get("team")
        m = N.match_one(
            {"player": name, "team": team, "position": raw.get("position")},
            prepared, aliases, teams,
        )
        row = {
            "source": SOURCE,
            "name": name,
            "team": "" if team is None else str(team).strip(),
            "opponent": raw.get("opp"),
            "game_id": None,
            "fpts_dk": raw.get("proj"),
            "player_id": m.player_id,
            "match_reason": m.reason or "matched",
        }
        out.append(row)
        if m.player_id is None:
            unmatched.append({
                "name": name,
                "team": row["team"],
                "reason": m.reason or "unmatched",
            })
    return out, unmatched


def to_db_frame(rows: list[dict], season: int, week: int) -> pl.DataFrame:
    schema = {
        "source": pl.Utf8,
        "season": pl.Int64,
        "week": pl.Int64,
        "player_id": pl.Utf8,
        "name": pl.Utf8,
        "team": pl.Utf8,
        "opponent": pl.Utf8,
        "game_id": pl.Utf8,
        "pass_yds": pl.Float64,
        "pass_td": pl.Float64,
        "pass_int": pl.Float64,
        "rush_yds": pl.Float64,
        "rush_td": pl.Float64,
        "rec_yds": pl.Float64,
        "rec_td": pl.Float64,
        "fpts_dk": pl.Float64,
    }
    recs = []
    for r in rows:
        recs.append({
            "source": SOURCE,
            "season": season,
            "week": week,
            "player_id": r.get("player_id"),
            "name": r["name"],
            "team": r.get("team") or "",
            "opponent": r.get("opponent"),
            "game_id": r.get("game_id"),
            "pass_yds": None,
            "pass_td": None,
            "pass_int": None,
            "rush_yds": None,
            "rush_td": None,
            "rec_yds": None,
            "rec_td": None,
            "fpts_dk": r.get("fpts_dk"),
        })
    return pl.DataFrame(recs, schema=schema) if recs else pl.DataFrame(schema=schema)


def run(season: int, week: int, path: Path | None = None) -> dict:
    """Parse the RTS CSV, match ids, upsert raw.external_players. Fail closed."""
    from ..db import upsert
    from ..ingest import names as N
    from ..ingest.overrides import load_catalog

    src = Path(path) if path is not None else csv_path(season, week)
    if not src.exists():
        raise ValueError(
            f"RTS file not found: {src}. Expected data/benchmarks/"
            f"rts_projections_{season}_week{week:02d}.csv"
        )
    raw = R.parse_rts_csv(src)
    rows, unmatched = from_rts(raw, load_catalog(), N.load_aliases(), N.load_teams())
    n = upsert(to_db_frame(rows, season, week), "raw.external_players", KEY_COLS)
    return {
        "season": season,
        "week": week,
        "path": str(src),
        "rows": len(rows),
        "written": n,
        "matched": sum(1 for r in rows if r.get("player_id")),
        "unmatched_n": len(unmatched),
        "unmatched": unmatched,
    }
