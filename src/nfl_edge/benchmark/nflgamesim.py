"""Parse a mygamesim weekly-page paste into the nflgamesim benchmark CSV + raw.external_games.

Paste grammar (one block per game, extra lines ignored):
  <Away> @ <Home>
  ML: <home_ml> / <away_ml> Spd: <spread> O/U: <total>
  <Winner> WIN <winner_pts>-<loser_pts> by <margin> <pct>%

Conventions (verified against the week-1/week-2 files):
  "ML: a / b" is home / away; "Spd" is the home spread.
  "WIN x-y" is winner-loser points; pct is the winner's win probability.
  sim_p_home_win = pct if home won else 1 - pct; sim_margin_home = +/- margin.
  market_p_home_novig = devig_two_way(home_ml, away_ml); edges/leans from the spec.
  game_id / team codes / gameday / gametime come from raw.schedules
  (LA, WAS, JAX -- never LAR / WSH / JAC). A pasted game that does not match the
  schedule raises UnmatchedGame and writes nothing.
"""
from __future__ import annotations

import csv
import re
from datetime import date, datetime
from pathlib import Path

import polars as pl

from ..config import ROOT
from ..ingest.odds_api import TEAM_NAMES
from ..market.edge import devig_two_way

SOURCE = "nflgamesim"
TEAM_ALIASES = {"LAR": "LA", "JAC": "JAX", "WSH": "WAS", "JAX": "JAX"}

COLS = [
    "game_id", "season", "week", "gameday", "gametime", "away_team", "home_team", "source",
    "market_spread_home", "market_total", "market_ml_home", "market_ml_away",
    "market_p_home_novig", "sim_home_pts", "sim_away_pts", "sim_total", "sim_margin_home",
    "sim_p_home_win", "sim_pick_winner", "sim_ats_lean", "sim_total_lean",
    "edge_spread_home", "edge_total", "edge_ml_home", "status",
    "actual_home_pts", "actual_away_pts", "actual_margin_home", "actual_total",
    "actual_winner", "pick_winner_result", "margin_within_7", "ats_result",
]

MARKET_RE = re.compile(
    r"ML:\s*(?P<ml_home>[+-]?\d+)\s*/\s*(?P<ml_away>[+-]?\d+)"
    r"\s+Spd:\s*(?P<spd>[+-]?\d+(?:\.\d+)?)"
    r"\s+O/?U:\s*(?P<ou>\d+(?:\.\d+)?)"
)
WIN_RE = re.compile(
    r"(?P<winner>.+?)\s+WIN\s+"
    r"(?P<wpts>\d+(?:\.\d+)?)\s*-\s*(?P<lpts>\d+(?:\.\d+)?)\s+"
    r"by\s+(?P<margin>\d+(?:\.\d+)?).*?"
    r"(?P<pct>\d+(?:\.\d+)?)\s*%"
)


class UnmatchedGame(ValueError):
    """A pasted matchup did not match that week's raw.schedules. Fail closed."""


_FULL_TO_ABBR = {k.lower(): v for k, v in TEAM_NAMES.items()}
_ABBRS = set(TEAM_NAMES.values())


def map_team_token(token: str) -> str:
    """Map a paste team token (code or full name) to the schedule code. No new mappings."""
    t = (token or "").strip()
    if not t:
        raise UnmatchedGame("empty team name in paste")
    up = t.upper().replace(".", "")
    up = TEAM_ALIASES.get(up, up)
    if up in _ABBRS:
        return up
    abbr = _FULL_TO_ABBR.get(t.lower().strip())
    if abbr is None:
        raise UnmatchedGame(f"unmapped team name: {token!r}")
    return TEAM_ALIASES.get(abbr, abbr)


def parse_cards(text: str) -> list[dict]:
    """Split the paste into one card per game. Pure. Raises on incomplete blocks."""
    lines = [ln.strip() for ln in (text or "").splitlines()]
    matchups: list[tuple[int, str, str]] = []
    for i, ln in enumerate(lines):
        if "@" not in ln or "ML:" in ln or "WIN" in ln:
            continue
        parts = ln.split("@")
        if len(parts) != 2:
            continue
        away_raw, home_raw = parts[0].strip(), parts[1].strip()
        if not away_raw or not home_raw:
            continue
        matchups.append((i, away_raw, home_raw))
    markets = [(i, MARKET_RE.search(ln)) for i, ln in enumerate(lines)]
    markets = [(i, m) for i, m in markets if m]
    wins = [(i, WIN_RE.search(ln)) for i, ln in enumerate(lines)]
    wins = [(i, m) for i, m in wins if m]
    if not (len(matchups) == len(markets) == len(wins)):
        raise ValueError(
            f"paste has {len(matchups)} matchups, {len(markets)} ML lines, "
            f"{len(wins)} WIN lines; each game needs all three"
        )
    cards = []
    for (mi, away_raw, home_raw), (_, mkt), (_, win) in zip(matchups, markets, wins):
        cards.append({
            "away_raw": away_raw,
            "home_raw": home_raw,
            "ml_home": int(mkt.group("ml_home")),
            "ml_away": int(mkt.group("ml_away")),
            "spread": float(mkt.group("spd")),
            "total": float(mkt.group("ou")),
            "winner_raw": win.group("winner").strip(),
            "win_pts": float(win.group("wpts")),
            "lose_pts": float(win.group("lpts")),
            "margin": float(win.group("margin")),
            "pct": float(win.group("pct")),
        })
    return cards


def _as_date(v) -> date:
    if isinstance(v, date) and not isinstance(v, datetime):
        return v
    if isinstance(v, datetime):
        return v.date()
    return datetime.fromisoformat(str(v)[:10]).date()


def _f1(x: float) -> str:
    r = round(float(x), 1)
    if r == 0:
        r = 0.0
    return f"{r:.1f}"


def _f4(x: float) -> str:
    r = round(float(x), 4)
    if r == 0:
        return "0.0"
    return str(r)


def build_rows(cards: list[dict], schedules: pl.DataFrame, season: int, week: int) -> list[dict]:
    """Join cards to schedules and compute the 33 columns. Pending status; blank actuals."""
    sched = {r["game_id"]: r for r in schedules.iter_rows(named=True)} if not schedules.is_empty() else {}
    by_teams: dict[tuple[str, str], dict] = {}
    for r in sched.values():
        by_teams[(str(r["home_team"]), str(r["away_team"]))] = r
    rows = []
    for c in cards:
        away = map_team_token(c["away_raw"])
        home = map_team_token(c["home_raw"])
        winner = map_team_token(c["winner_raw"])
        if winner not in (home, away):
            raise UnmatchedGame(
                f"winner {c['winner_raw']!r} is neither {c['away_raw']!r} nor {c['home_raw']!r}"
            )
        s = by_teams.get((home, away))
        if s is None:
            raise UnmatchedGame(f"paste game {c['away_raw']} @ {c['home_raw']} not in week schedule")
        home_won = winner == home
        sim_home = c["win_pts"] if home_won else c["lose_pts"]
        sim_away = c["lose_pts"] if home_won else c["win_pts"]
        sim_total = round(sim_home + sim_away, 1)
        sim_margin = round(c["margin"] if home_won else -c["margin"], 1)
        p_winner = c["pct"] / 100.0
        sim_p = round(p_winner if home_won else 1.0 - p_winner, 4)
        market_p, _ = devig_two_way(c["ml_home"], c["ml_away"])
        market_p = round(market_p, 4)
        edge_spread = round(sim_margin + c["spread"], 1)
        edge_total = round(sim_total - c["total"], 1)
        edge_ml = round(sim_p - market_p, 4)
        ats_lean = home if edge_spread > 0 else (away if edge_spread < 0 else "push")
        total_lean = "over" if edge_total > 0 else ("under" if edge_total < 0 else "push")
        rows.append({
            "game_id": s["game_id"],
            "season": season,
            "week": week,
            "gameday": _as_date(s["gameday"]).isoformat(),
            "gametime": str(s["gametime"]),
            "away_team": away,
            "home_team": home,
            "source": SOURCE,
            "market_spread_home": _f1(c["spread"]),
            "market_total": _f1(c["total"]),
            "market_ml_home": str(c["ml_home"]),
            "market_ml_away": str(c["ml_away"]),
            "market_p_home_novig": _f4(market_p),
            "sim_home_pts": _f1(sim_home),
            "sim_away_pts": _f1(sim_away),
            "sim_total": _f1(sim_total),
            "sim_margin_home": _f1(sim_margin),
            "sim_p_home_win": _f4(sim_p),
            "sim_pick_winner": winner,
            "sim_ats_lean": ats_lean,
            "sim_total_lean": total_lean,
            "edge_spread_home": _f1(edge_spread),
            "edge_total": _f1(edge_total),
            "edge_ml_home": _f4(edge_ml),
            "status": "pending",
            "actual_home_pts": "",
            "actual_away_pts": "",
            "actual_margin_home": "",
            "actual_total": "",
            "actual_winner": "",
            "pick_winner_result": "",
            "margin_within_7": "",
            "ats_result": "",
        })
    return rows


def apply_actuals(rows: list[dict], schedules: pl.DataFrame) -> list[dict]:
    """Fill finals from raw.schedules scores. Pending games keep blank actuals."""
    finals = {}
    if not schedules.is_empty():
        for r in schedules.iter_rows(named=True):
            finals[r["game_id"]] = r
    out = []
    for row in rows:
        s = finals.get(row["game_id"], {})
        result, total = s.get("result"), s.get("total")
        hs, aws = s.get("home_score"), s.get("away_score")
        if result is None or hs is None or aws is None or total is None:
            out.append({**row, "status": "pending",
                        "actual_home_pts": "", "actual_away_pts": "",
                        "actual_margin_home": "", "actual_total": "",
                        "actual_winner": "", "pick_winner_result": "",
                        "margin_within_7": "", "ats_result": ""})
            continue
        actual_margin = int(result)
        actual_total = int(total)
        home_pts, away_pts = int(hs), int(aws)
        actual_winner = row["home_team"] if actual_margin > 0 else (
            row["away_team"] if actual_margin < 0 else "tie")
        pick = "push" if actual_winner == "tie" else (
            "correct" if row["sim_pick_winner"] == actual_winner else "incorrect")
        within = "yes" if abs(float(row["sim_margin_home"]) - actual_margin) <= 7 + 1e-9 else "no"
        cover_at = round(actual_margin + float(row["market_spread_home"]), 1)
        if cover_at > 0:
            cover = row["home_team"]
        elif cover_at < 0:
            cover = row["away_team"]
        else:
            cover = "push"
        ats = "push" if cover == "push" else ("correct" if cover == row["sim_ats_lean"] else "incorrect")
        out.append({**row, "status": "final",
                    "actual_home_pts": str(home_pts), "actual_away_pts": str(away_pts),
                    "actual_margin_home": str(actual_margin), "actual_total": str(actual_total),
                    "actual_winner": actual_winner, "pick_winner_result": pick,
                    "margin_within_7": within, "ats_result": ats})
    return out


def write_csv(rows: list[dict], path: Path) -> Path:
    """Write the 33 columns with CRLF endings (matches the committed files)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=COLS, lineterminator="\r\n")
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in COLS})
    return path


def csv_path(season: int, week: int) -> Path:
    return ROOT / "data" / "benchmarks" / f"nflgamesim_{season}_week{week:02d}.csv"


def load_schedules(season: int, week: int) -> pl.DataFrame:
    from ..db import read_sql

    return read_sql(
        """
        select game_id, season, week, gameday, gametime, home_team, away_team,
               home_score, away_score, result, total
        from raw.schedules
        where season = %s and week = %s and game_type = 'REG'
        order by game_id
        """,
        (season, week),
    )


def _to_db_frame(rows: list[dict]) -> pl.DataFrame:
    recs = []
    for r in rows:
        d: dict = {}
        for k in COLS:
            v = r.get(k, "")
            if k in ("season", "week", "market_ml_home", "market_ml_away"):
                d[k] = int(v)
            elif k in ("market_spread_home", "market_total", "market_p_home_novig",
                       "sim_home_pts", "sim_away_pts", "sim_total", "sim_margin_home",
                       "sim_p_home_win", "edge_spread_home", "edge_total", "edge_ml_home",
                       "actual_home_pts", "actual_away_pts", "actual_margin_home",
                       "actual_total"):
                d[k] = None if v == "" else float(v)
            elif k == "gameday":
                d[k] = _as_date(v)
            else:
                d[k] = None if v == "" else str(v)
        recs.append(d)
    return pl.DataFrame(recs) if recs else pl.DataFrame(schema={k: pl.Utf8 for k in COLS})


def run(season: int, week: int, path: Path, schedules: pl.DataFrame | None = None) -> dict:
    """Parse the paste, write the CSV, upsert raw.external_games. Fail closed."""
    from ..db import upsert

    text = Path(path).read_text()
    sched = load_schedules(season, week) if schedules is None else schedules
    rows = build_rows(parse_cards(text), sched, season, week)
    out = write_csv(rows, csv_path(season, week))
    n = upsert(_to_db_frame(rows), "raw.external_games", ["source", "game_id"])
    return {"season": season, "week": week, "rows": len(rows), "written": n,
            "csv": str(out)}


def refresh(season: int, week: int, schedules: pl.DataFrame | None = None) -> dict:
    """Fill finals for the week's rows from raw.schedules; rewrite CSV + upsert."""
    from ..db import read_sql, upsert

    sched = load_schedules(season, week) if schedules is None else schedules
    path = csv_path(season, week)
    if path.exists():
        with open(path, newline="") as f:
            rows = [{k: (v or "") for k, v in rec.items()} for rec in csv.DictReader(f)]
    else:
        df = read_sql(
            "select * from raw.external_games where source = %s and season = %s and week = %s",
            (SOURCE, season, week),
        )
        rows = [{k: ("" if v is None else str(v)) for k, v in r.items()}
                for r in df.iter_rows(named=True)] if not df.is_empty() else []
    rows = apply_actuals(rows, sched)
    n_final = sum(1 for r in rows if r["status"] == "final")
    if rows:
        write_csv(rows, path)
        n = upsert(_to_db_frame(rows), "raw.external_games", ["source", "game_id"])
    else:
        n = 0
    return {"season": season, "week": week, "rows": len(rows), "final": n_final,
            "written": n, "csv": str(path)}
