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


WEEK_HEADER_RE = re.compile(r"NFL Predictions for Week (\d+)")
PAGE_WIN_RE = re.compile(r"WIN\s+(?P<wpts>\d+(?:\.\d+)?)\s*-\s*(?P<lpts>\d+(?:\.\d+)?)")
PAGE_PCT_RE = re.compile(
    r"won\s+(?P<pct>\d+(?:\.\d+)?)%\s+of sims,\s+average margin of\s+(?P<margin>\d+(?:\.\d+)?)"
)
SUMMARY_RES = {
    "pick": re.compile(r"Pick Accuracy\s+Pick\s+(\d+)"),
    "margin": re.compile(r"Final Margin within 7 Pts\s+Margin\s+(\d+)"),
    "ats": re.compile(r"Beat the Spread\s+Vs Spread\s+(\d+)"),
}


def _page_card(block: list[str], away: str, home: str, week: int) -> dict:
    """One game block of the current page grammar -> a parse_cards-shaped card plus site flags."""
    joined = " ".join(block)
    where = f"week {week} {away} @ {home}"
    mkt = MARKET_RE.search(joined)
    if mkt is None:
        raise ValueError(f"{where}: no ML / Spd / O/U lines")
    win_i = next((i for i, ln in enumerate(block) if PAGE_WIN_RE.search(ln)), None)
    if win_i is None or win_i == 0:
        raise ValueError(f"{where}: no 'WIN a-b' line with a winner above it")
    win = PAGE_WIN_RE.search(block[win_i])
    pct = PAGE_PCT_RE.search(joined)
    if pct is None:
        raise ValueError(f"{where}: no 'won p% of sims, average margin of m' line")
    pick_line = next((ln for ln in block if ln.startswith("Pick:")), None)
    return {
        "away_raw": away,
        "home_raw": home,
        "ml_home": int(mkt.group("ml_home")),
        "ml_away": int(mkt.group("ml_away")),
        "spread": float(mkt.group("spd")),
        "total": float(mkt.group("ou")),
        "winner_raw": block[win_i - 1],
        "win_pts": float(win.group("wpts")),
        "lose_pts": float(win.group("lpts")),
        "margin": float(pct.group("margin")),
        "pct": float(pct.group("pct")),
        "site_final": pick_line is not None,
        "site_pick": pick_line.split(":", 1)[1].strip().lower() if pick_line else None,
        "site_margin_hit": "Margin Hit" in block,
        "site_ats_hit": "Vs Spread Hit" in block,
    }


def parse_page(text: str) -> dict[int, dict]:
    """Parse a whole mygamesim page paste (any number of weeks) in the current grammar.

    Returns {week: {"cards": [...], "summary": {"pick", "margin", "ats"} | None}}. Cards have the
    parse_cards shape plus the site's own result flags (site_final / site_pick / site_margin_hit /
    site_ats_hit); absence of "Margin Hit" or "Vs Spread Hit" on a final game means a miss.
    """
    lines = [ln.strip() for ln in (text or "").splitlines()]
    heads = [(i, int(m.group(1))) for i, ln in enumerate(lines) if (m := WEEK_HEADER_RE.fullmatch(ln))]
    if not heads:
        raise ValueError("no 'NFL Predictions for Week N' header found in the paste")
    out: dict[int, dict] = {}
    for k, (start, week) in enumerate(heads):
        end = heads[k + 1][0] if k + 1 < len(heads) else len(lines)
        section = lines[start:end]
        legend = next((i for i, ln in enumerate(section) if ln == "Legend/Totals"), len(section))
        games = [i for i in range(2, legend - 1) if section[i] == "@" and section[i - 1] and section[i + 1]]
        cards = []
        for n, at in enumerate(games):
            stop = games[n + 1] - 2 if n + 1 < len(games) else legend
            cards.append(_page_card(section[at - 2 : stop], section[at - 1], section[at + 1], week))
        tail = " ".join(section[legend:])
        counts = {name: rx.search(tail) for name, rx in SUMMARY_RES.items()}
        summary = {name: int(m.group(1)) for name, m in counts.items()} if all(counts.values()) else None
        out[week] = {"cards": cards, "summary": summary}
    return out


def flag_mismatches(cards: list[dict], rows: list[dict]) -> list[str]:
    """Where the site's own result flags disagree with ours (apply_actuals). Report only."""
    by_teams = {(r["away_team"], r["home_team"]): r for r in rows}
    out: list[str] = []
    for c in cards:
        if not c.get("site_final"):
            continue
        row = by_teams.get((map_team_token(c["away_raw"]), map_team_token(c["home_raw"])))
        if row is None or row.get("status") != "final":
            continue
        tag = f"{row['game_id']} {row['away_team']}@{row['home_team']}"
        if c["site_pick"] != row["pick_winner_result"]:
            out.append(f"{tag} pick: site {c['site_pick']}, ours {row['pick_winner_result']}")
        if c["site_margin_hit"] != (row["margin_within_7"] == "yes"):
            site = "hit" if c["site_margin_hit"] else "miss"
            out.append(f"{tag} margin within 7: site {site}, ours {row['margin_within_7']}")
        if c["site_ats_hit"] != (row["ats_result"] == "correct"):
            site = "hit" if c["site_ats_hit"] else "miss"
            out.append(f"{tag} vs spread: site {site}, ours {row['ats_result']}")
    return out


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


def build_page_week(
    cards: list[dict], schedules: pl.DataFrame, season: int, week: int
) -> list[dict]:
    """Rows for one page week with finals applied from raw.schedules.

    The page shows margins to 0.1 but the site leans on the unrounded number, so a rounded edge
    of exactly 0 leaves the lean as "push". When the site itself called that game a spread hit,
    the lean is the side that covered; otherwise it stays "push" (a miss).
    """
    rows = build_rows(cards, schedules, season, week)
    finals = {r["game_id"]: r for r in schedules.iter_rows(named=True)} if not schedules.is_empty() else {}
    by_teams = {(r["away_team"], r["home_team"]): r for r in rows}
    for c in cards:
        row = by_teams[(map_team_token(c["away_raw"]), map_team_token(c["home_raw"]))]
        s = finals.get(row["game_id"], {})
        if not (c.get("site_ats_hit") and row["sim_ats_lean"] == "push" and s.get("result") is not None):
            continue
        cover_at = round(int(s["result"]) + float(row["market_spread_home"]), 1)
        if cover_at != 0:
            row["sim_ats_lean"] = row["home_team"] if cover_at > 0 else row["away_team"]
    return apply_actuals(rows, schedules)


def backup_csv(path: Path) -> Path | None:
    """Keep the previous file next to the new one as <name>.prev.csv."""
    path = Path(path)
    if not path.exists():
        return None
    prev = path.with_suffix(".prev.csv")
    prev.write_bytes(path.read_bytes())
    return prev


def run_page(season: int, path: Path, week: int | None = None) -> list[dict]:
    """Parse a multi-week page paste, rebuild each week's rows, write CSVs, upsert. Fail closed.

    Every week is parsed and matched to raw.schedules before anything is written, so an
    unmatched game writes nothing. Returns one summary dict per week.
    """
    from ..db import upsert

    parsed = parse_page(Path(path).read_text())
    if week is not None:
        if week not in parsed:
            raise ValueError(f"week {week} is not in the paste (has {sorted(parsed)})")
        parsed = {week: parsed[week]}
    built: dict[int, list[dict]] = {}
    for w, pw in sorted(parsed.items()):
        built[w] = build_page_week(pw["cards"], load_schedules(season, w), season, w)
    out = []
    for w, rows in built.items():
        backup_csv(csv_path(season, w))
        csv_out = write_csv(rows, csv_path(season, w))
        n = upsert(_to_db_frame(rows), "raw.external_games", ["source", "game_id"])
        fin = [r for r in rows if r["status"] == "final"]
        out.append({
            "season": season, "week": w, "rows": len(rows), "written": n, "final": len(fin),
            "csv": str(csv_out),
            "ours": {
                "pick": sum(r["pick_winner_result"] == "correct" for r in fin),
                "margin": sum(r["margin_within_7"] == "yes" for r in fin),
                "ats": sum(r["ats_result"] == "correct" for r in fin),
            },
            "site": parsed[w]["summary"],
            "mismatches": flag_mismatches(parsed[w]["cards"], rows),
        })
    return out


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
