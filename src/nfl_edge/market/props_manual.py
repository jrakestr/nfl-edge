"""Parse a manual prop-lines CSV and match names into model.market_props.

CSV columns: player, stat, line, over_odds, under_odds
Optional: team, position (same matcher as overrides/DK).
stat is one of pass_yds | rush_yds | rec_yds | rec | pass_td | anytime_td.
"""
from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import polars as pl

from ..db import insert, read_sql
from ..ingest import names as N

VALID_STATS = frozenset({"pass_yds", "rush_yds", "rec_yds", "rec", "pass_td", "anytime_td"})


def parse_props_csv(path: Path) -> list[dict]:
    df = pl.read_csv(path, infer_schema_length=None)
    cols = {c.lower().strip(): c for c in df.columns}
    need = ("player", "stat", "line")
    missing = [c for c in need if c not in cols]
    if missing:
        raise ValueError(f"props CSV needs columns {need}; missing {missing}")
    out = []
    for row in df.iter_rows(named=True):
        raw = {k.lower().strip(): v for k, v in row.items()}
        player = "" if raw.get("player") is None else str(raw["player"]).strip()
        if not player:
            continue
        stat = "" if raw.get("stat") is None else str(raw["stat"]).strip().lower()
        try:
            line = float(raw["line"])
        except (TypeError, ValueError):
            continue

        def _odds(key: str, src: dict) -> int | None:
            v = src.get(key)
            if v is None or str(v).strip() == "":
                return None
            try:
                return int(v)
            except (TypeError, ValueError):
                return None

        team = None if raw.get("team") in (None, "") else str(raw["team"]).strip()
        position = None if raw.get("position") in (None, "") else str(raw["position"]).strip()
        out.append({
            "player": player, "stat": stat, "line": line,
            "over_odds": _odds("over_odds", raw), "under_odds": _odds("under_odds", raw),
            "team": team, "position": position,
        })
    return out


def match_props(rows: list[dict], catalog: pl.DataFrame, aliases: dict[str, str],
                teams: dict) -> tuple[list[dict], list[dict]]:
    catalog = catalog if "_dn" in catalog.columns else N.prepare_catalog(catalog)
    matched, unmatched = [], []
    for row in rows:
        if row.get("stat") not in VALID_STATS:
            unmatched.append({**row, "reason": "bad_stat"})
            continue
        m = N.match_one(row, catalog, aliases, teams)
        if m.player_id is None:
            unmatched.append({**row, "reason": m.reason})
            continue
        matched.append({
            "player_id": m.player_id,
            "player_name": row["player"],
            "stat": row["stat"],
            "line": float(row["line"]),
            "over_odds": row.get("over_odds"),
            "under_odds": row.get("under_odds"),
        })
    return matched, unmatched


def load_catalog() -> pl.DataFrame:
    return read_sql(
        "select gsis_id, display_name, merge_name, latest_team, position from raw.players"
    )


def persist(season: int, week: int, matched: list[dict], captured_at) -> int:
    if not matched:
        return 0
    frame = pl.DataFrame([{
        "season": season, "week": week,
        "player_id": r["player_id"], "player_name": r["player_name"],
        "stat": r["stat"], "line": r["line"],
        "over_odds": r["over_odds"], "under_odds": r["under_odds"],
        "source": "manual", "captured_at": captured_at,
    } for r in matched])
    return insert(frame, "model.market_props")


def run(season: int, week: int, path: Path) -> dict:
    rows = parse_props_csv(Path(path))
    matched, unmatched = match_props(rows, load_catalog(), N.load_aliases(), N.load_teams())
    captured_at = datetime.now(UTC)
    written = persist(season, week, matched, captured_at)
    return {
        "path": str(path),
        "season": season,
        "week": week,
        "rows": len(rows),
        "written": written,
        "matched": matched,
        "unmatched": unmatched,
        "captured_at": captured_at,
    }
