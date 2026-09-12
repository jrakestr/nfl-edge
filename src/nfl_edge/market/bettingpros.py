"""BettingPros Smart Money Picks → model.market_props (source='bettingpros').

Market overlay only. Nothing here is a prior or a sim input.

The roster join is identity, not availability: raw.rosters_weekly for a
pre-kickoff season is the 90-man preseason roster (nflverse load_rosters
standing in until weekly rosters publish), not the week-1 active 53. A
name+team hit means we found the player, not that they are on the 53.
"""
from __future__ import annotations

import math
import re
from datetime import UTC, datetime
from pathlib import Path

import fastexcel
import polars as pl

from ..db import execute, insert, read_sql
from ..ingest.names import load_teams, merge_key, normalize_team

SHEET_NAME = "Smart Money Picks"
MIN_SURVIVORS = 60
SOURCE = "bettingpros"
MARKET_TO_STAT = {
    "Receptions": "rec",
    "Rec Yds": "rec_yds",
    "Rush Yds": "rush_yds",
    "Pass TDs": "pass_td",
    "Interceptions": "int",
}
SLATE_RE = re.compile(r"Slate date:\s*(\d{1,2}/\d{1,2}/\d{4})")
PICK_RE = re.compile(r"^(Over|Under)\s+(\d+\.5)$", re.IGNORECASE)


def resolve_xlsx(path: Path) -> Path:
    path = Path(path)
    if path.is_file():
        if path.name.startswith("~$"):
            raise ValueError(f"Excel lock file: {path.name}")
        return path
    if not path.is_dir():
        raise ValueError(f"not a file or directory: {path}")
    found = sorted(p for p in path.glob("*.xlsx") if not p.name.startswith("~$"))
    if not found:
        raise ValueError(f"no xlsx in {path}")
    if len(found) > 1:
        raise ValueError(f"more than one xlsx in {path}: {[p.name for p in found]}")
    return found[0]


def parse_slate_date(text: str) -> datetime:
    m = SLATE_RE.search(text or "")
    if not m:
        raise ValueError(f"no slate date in {text!r}")
    month, day, year = (int(p) for p in m.group(1).split("/"))
    return datetime(year, month, day, tzinfo=UTC)


def parse_pick(pick: str) -> tuple[str, float] | None:
    m = PICK_RE.match((pick or "").strip())
    if not m:
        return None
    return m.group(1).lower(), float(m.group(2))


def parse_odds(v) -> int | None:
    if v is None or (isinstance(v, str) and str(v).strip() == ""):
        return None
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _blank(v) -> bool:
    if v is None:
        return True
    if isinstance(v, float) and math.isnan(v):
        return True
    return str(v).strip() == ""


def load_sheet(path: Path) -> tuple[str, pl.DataFrame]:
    raw = fastexcel.read_excel(path).load_sheet(SHEET_NAME, header_row=None).to_polars()
    banner = ""
    header_idx = None
    headers: list[str] = []
    for i, row in enumerate(raw.iter_rows()):
        vals = ["" if v is None else str(v).strip() for v in row]
        if not banner:
            hit = next((v for v in vals if "Slate date:" in v), None)
            if hit:
                banner = hit
        if "Selection" in vals and "Market" in vals and "Pick" in vals:
            header_idx = i
            headers = [v if v else f"col{j}" for j, v in enumerate(vals)]
            break
    if header_idx is None:
        raise ValueError(f"{SHEET_NAME} has no header row with Selection/Market/Pick")
    df = raw.slice(header_idx + 1)
    df.columns = headers
    return banner, df


def load_known_stats() -> list[str]:
    df = read_sql("select distinct stat from model.fair_props order by 1")
    if df.is_empty() or "stat" not in df.columns:
        return []
    return [str(s) for s in df["stat"].to_list() if s is not None]


def load_roster(season: int, week: int) -> pl.DataFrame:
    return read_sql(
        """
        select gsis_id, full_name, team, position
        from raw.rosters_weekly
        where season = %s and week = %s
        """,
        (season, week),
    )


def classify(df: pl.DataFrame, known_stats) -> dict:
    known = set(known_stats)
    rows = df.to_dicts()
    with_sel = [r for r in rows if not _blank(r.get("Selection"))]
    team_rows = [r for r in with_sel if not _blank(r.get("Game"))]
    player_rows = [r for r in with_sel if _blank(r.get("Game"))]
    rejected: dict[str, int] = {}
    mapped = []
    bad_picks = []
    for r in player_rows:
        market = "" if _blank(r.get("Market")) else str(r["Market"]).strip()
        target = MARKET_TO_STAT.get(market)
        if target is None or target not in known:
            rejected[market or "?"] = rejected.get(market or "?", 0) + 1
            continue
        parsed = parse_pick("" if _blank(r.get("Pick")) else str(r["Pick"]))
        if parsed is None:
            bad_picks.append(r)
            continue
        side, line = parsed
        odds = parse_odds(r.get("Consensus Odds"))
        mapped.append({
            "player": str(r["Selection"]).strip(),
            "pos": None if _blank(r.get("Pos")) else str(r["Pos"]).strip(),
            "team": None if _blank(r.get("Team")) else str(r["Team"]).strip(),
            "stat": target,
            "side": side,
            "line": line,
            "over_odds": odds if side == "over" else None,
            "under_odds": odds if side == "under" else None,
            "market": market,
        })
    return {
        "n_selection": len(with_sel),
        "n_team": len(team_rows),
        "n_player": len(player_rows),
        "n_mapped": len(mapped),
        "mapped": mapped,
        "rejected_markets": [
            {"market": k, "n": n} for k, n in sorted(rejected.items(), key=lambda kv: (-kv[1], kv[0]))
        ],
        "team_rows": team_rows,
        "bad_picks": bad_picks,
    }


def join_roster(mapped: list[dict], roster: pl.DataFrame) -> tuple[list[dict], list[dict]]:
    teams = load_teams()
    if roster.is_empty():
        return [], [{**r, "reason": "unmatched"} for r in mapped]
    prepared = roster.with_columns(
        pl.col("full_name").fill_null("").map_elements(merge_key, return_dtype=pl.Utf8).alias("_n"),
        pl.col("team").map_elements(
            lambda t: normalize_team(t, teams), return_dtype=pl.Utf8,
        ).alias("_t"),
    )
    matched, rejected = [], []
    for row in mapped:
        key = merge_key(row["player"])
        team = normalize_team(row.get("team"), teams)
        if not team:
            rejected.append({**row, "reason": "unmatched"})
            continue
        hits = prepared.filter((pl.col("_n") == key) & (pl.col("_t") == team))
        if hits.height == 1:
            hit = hits.row(0, named=True)
            matched.append({
                "player_id": hit["gsis_id"],
                "player_name": row["player"],
                "stat": row["stat"],
                "line": float(row["line"]),
                "over_odds": row.get("over_odds"),
                "under_odds": row.get("under_odds"),
                "pos": row.get("pos"),
                "team": row.get("team"),
            })
        elif hits.height > 1:
            rejected.append({**row, "reason": "ambiguous"})
        else:
            rejected.append({**row, "reason": "unmatched"})
    return matched, rejected


def persist(season: int, week: int, matched: list[dict], captured_at: datetime) -> int:
    execute(
        """
        delete from model.market_props
        where source = %s and season = %s and week = %s and captured_at = %s
        """,
        (SOURCE, season, week, captured_at),
    )
    if not matched:
        return 0
    frame = pl.DataFrame(
        [{
            "season": season,
            "week": week,
            "player_id": r["player_id"],
            "player_name": r["player_name"],
            "stat": r["stat"],
            "line": float(r["line"]),
            "over_odds": r.get("over_odds"),
            "under_odds": r.get("under_odds"),
            "source": SOURCE,
            "captured_at": captured_at,
        } for r in matched],
        schema={
            "season": pl.Int64,
            "week": pl.Int64,
            "player_id": pl.Utf8,
            "player_name": pl.Utf8,
            "stat": pl.Utf8,
            "line": pl.Float64,
            "over_odds": pl.Int64,
            "under_odds": pl.Int64,
            "source": pl.Utf8,
            "captured_at": pl.Datetime("us", "UTC"),
        },
    )
    return insert(frame, "model.market_props")


def commit_if_enough(
    season: int, week: int, matched: list[dict], _rejected: list[dict], captured_at: datetime,
) -> int:
    if len(matched) < MIN_SURVIVORS:
        return 0
    return persist(season, week, matched, captured_at)


def run(season: int, week: int, path: Path, *, known_stats=None, roster=None) -> dict:
    xlsx = resolve_xlsx(Path(path))
    banner, df = load_sheet(xlsx)
    captured_at = parse_slate_date(banner)
    stats = list(known_stats) if known_stats is not None else load_known_stats()
    classified = classify(df, stats)
    rost = roster if roster is not None else load_roster(season, week)
    matched, rejected = join_roster(classified["mapped"], rost)
    written = commit_if_enough(season, week, matched, rejected, captured_at)
    return {
        "path": str(xlsx),
        "season": season,
        "week": week,
        "captured_at": captured_at,
        "fair_stats": stats,
        "n_selection": classified["n_selection"],
        "n_team": classified["n_team"],
        "n_player": classified["n_player"],
        "n_mapped": classified["n_mapped"],
        "n_joined": len(matched),
        "written": written,
        "rejected_markets": classified["rejected_markets"],
        "rejected_roster": rejected,
        "stopped": written == 0 and len(matched) < MIN_SURVIVORS,
    }
