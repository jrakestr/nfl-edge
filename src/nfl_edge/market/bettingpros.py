"""BettingPros Smart Money Picks → model.market_props (source='bettingpros').

Market overlay only. Nothing here is a prior or a sim input.

The roster join is identity, not availability: raw.rosters_weekly for a
pre-kickoff season is the 90-man preseason roster (nflverse load_rosters
standing in until weekly rosters publish), not the week-1 active 53. A
name+team hit means we found the player, not that they are on the 53.
"""
from __future__ import annotations

import json
import math
import re
import ssl
import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import certifi
import fastexcel
import polars as pl

from ..config import bettingpros_api_key
from ..db import execute, insert, read_sql
from ..ingest.fantasypros_match import build_fp_map
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
API_BASE = "https://api.bettingpros.com/v3"
# One pull may span pages. Stop before a free-tier daily allowance is consumed.
API_MAX_PAGES = 80
# Display names already on this ingest or on outputs.props.STAT_LABELS.
# Hyphens and underscores collapse to spaces, so passing-yards matches.
PHRASE_TO_STAT = {
    "receptions": "rec",
    "rec yds": "rec_yds",
    "receiving yards": "rec_yds",
    "rush yds": "rush_yds",
    "rushing yards": "rush_yds",
    "pass tds": "pass_td",
    "passing tds": "pass_td",
    "pass yds": "pass_yds",
    "passing yards": "pass_yds",
    "interceptions": "int",
    "rush tds": "rush_td",
    "rushing tds": "rush_td",
    "rec tds": "rec_td",
    "receiving tds": "rec_td",
    "anytime tds": "anytime_td",
}
FAIR_STATS = frozenset(PHRASE_TO_STAT.values())
PLAYER_PROP_CATEGORIES = frozenset({"player-props", "props"})
_SSL = ssl.create_default_context(cafile=certifi.where())


class BettingProsError(RuntimeError):
    """Contract or HTTP failure. Nothing is written. The message has no key and no URL."""


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


def _norm_market(value) -> str:
    if value is None:
        return ""
    text = str(value).strip().casefold().replace("-", " ").replace("_", " ")
    return " ".join(text.split())


def _echo_one(got, expected: str) -> bool:
    if isinstance(got, list):
        return len(got) == 1 and str(got[0]) == expected
    return got is not None and str(got) == expected


def _check_echo(body: dict, season: int, week: int) -> None:
    params = body.get("_parameters")
    if not isinstance(params, dict):
        raise BettingProsError("BettingPros /props has no _parameters; nothing written")
    if not _echo_one(params.get("sport"), "NFL"):
        raise BettingProsError(
            f"BettingPros /props _parameters.sport is {params.get('sport')!r}; nothing written"
        )
    if not _echo_one(params.get("season"), str(season)):
        raise BettingProsError(
            f"BettingPros /props _parameters.season is {params.get('season')!r}; nothing written"
        )
    if not _echo_one(params.get("week"), str(week)):
        raise BettingProsError(
            f"BettingPros /props _parameters.week is {params.get('week')!r}; nothing written"
        )


def _pagination(body: dict) -> dict:
    page = body.get("_pagination")
    if not isinstance(page, dict) or "total_pages" not in page or "total_items" not in page:
        raise BettingProsError("BettingPros /props has no _pagination.total_pages; nothing written")
    return page


def _echoed_page(body: dict, expected: int) -> int:
    raw = _pagination(body).get("page")
    if raw is None:
        raise BettingProsError("_pagination.page is missing; nothing written")
    try:
        got = int(raw)
    except (TypeError, ValueError):
        raise BettingProsError(f"_pagination.page is {raw!r}; nothing written") from None
    if got != expected:
        raise BettingProsError(f"_pagination.page is {got}, asked {expected}; nothing written")
    return got


def _page_fingerprint(props: list) -> tuple:
    rows = []
    for prop in props:
        if not isinstance(prop, dict):
            rows.append(None)
            continue
        participant = prop.get("participant") if isinstance(prop.get("participant"), dict) else {}
        rows.append((prop.get("market_id"), participant.get("id"), prop.get("event_id")))
    return tuple(rows)


def finished_walk(counts: list[int], page_nos: list[int], total_items: int, page_size: int) -> None:
    """A short last page finishes the walk. A full last page that is short of total_items does not.

    `_pagination.total_items` may sit above the summed pages; that is an API total, not a missing page.
    """
    if page_size < 1:
        raise BettingProsError("_pagination.limit is missing; nothing written")
    expected = list(range(1, len(counts) + 1))
    if page_nos != expected:
        raise BettingProsError(f"_pagination.page is {page_nos}; nothing written")
    if not counts:
        raise BettingProsError("BettingPros /props props is empty; nothing written")
    last = counts[-1]
    for n, count in enumerate(counts[:-1], start=1):
        if count != page_size:
            raise BettingProsError(
                f"_pagination page {n} has {count} props, page size {page_size}; nothing written"
            )
    if last > page_size:
        raise BettingProsError(
            f"_pagination last page has {last} props, page size {page_size}; nothing written"
        )
    summed = sum(counts)
    if last == page_size and summed != total_items:
        raise BettingProsError(
            f"_pagination.total_items is {total_items} but props has {summed} "
            f"and the last page is full; nothing written"
        )


def api_headers(key: str) -> dict:
    """Auth header only. The key is never placed on the query string."""
    return {"x-api-key": key, "Accept": "application/json"}


def _urlopen_transport(path: str, params: dict, key: str) -> tuple[int, dict]:
    url = f"{API_BASE}{path}?{urlencode(params)}"
    req = Request(url, headers=api_headers(key))
    try:
        with urlopen(req, context=_SSL, timeout=60) as resp:
            body, status = resp.read(), resp.status
    except HTTPError as e:
        body, status = e.read(), e.code
    except URLError as e:
        raise BettingProsError(
            f"BettingPros unreachable ({type(e.reason).__name__})"
        ) from None
    try:
        parsed = json.loads(body)
    except ValueError:
        if status == 200:
            raise BettingProsError("BettingPros /props returned a non-JSON body") from None
        return status, {}
    if not isinstance(parsed, dict):
        raise BettingProsError("BettingPros /props returned a non-object body; nothing written")
    return status, parsed


def _parse_utc(body: dict) -> datetime:
    raw = body.get("utc")
    if isinstance(raw, str) and raw.strip():
        text = raw.strip().replace("Z", "+00:00")
        try:
            ts = datetime.fromisoformat(text)
        except ValueError:
            raise BettingProsError(f"BettingPros /props utc is {raw!r}; nothing written") from None
        return ts if ts.tzinfo else ts.replace(tzinfo=UTC)
    unix = body.get("ts")
    if isinstance(unix, (int, float)) and not isinstance(unix, bool):
        return datetime.fromtimestamp(float(unix), UTC)
    return datetime.now(UTC)


def _http_error(status: int, body: dict, where: str) -> BettingProsError:
    message = body.get("message") if isinstance(body, dict) else None
    detail = f"HTTP {status}" + (f" {message}" if message else "")
    return BettingProsError(f"BettingPros /props{where} returned {detail}; nothing written")


def _get_page(call, params: dict, key: str, sleep: Callable[[float], None], where: str) -> dict:
    """One page. A burst 429 waits once and retries that page; a daily limit does not."""
    status, body = call("/props", params, key)
    if status == 429 and isinstance(body, dict) and body.get("message") == "Too Many Requests":
        sleep(3.0)
        status, body = call("/props", params, key)
    if status != 200:
        raise _http_error(status, body, where)
    return body


def fetch_props(
    season: int, week: int, *, api_key: str | None = None, transport=None,
    sleep: Callable[[float], None] = time.sleep,
) -> dict:
    """One GET /v3/props for an NFL week. Later pages of that response are the same pull."""
    key = bettingpros_api_key() if api_key is None else api_key
    call = transport or _urlopen_transport
    params = {
        "sport": "NFL",
        "season": str(season),
        "week": str(week),
        "include_markets": "true",
        "ev_threshold": "false",
        "limit": "50",
    }
    body = _get_page(call, dict(params), key, sleep, "")
    _check_echo(body, season, week)
    page = _pagination(body)
    total_pages = int(page["total_pages"])
    if total_pages < 1:
        raise BettingProsError(
            f"BettingPros /props _pagination.total_pages is {total_pages}; nothing written"
        )
    if total_pages > API_MAX_PAGES:
        raise BettingProsError(
            f"BettingPros /props _pagination.total_pages is {total_pages}; nothing written"
        )
    if not isinstance(body.get("props"), list):
        raise BettingProsError("BettingPros /props props is not a list; nothing written")
    if "markets" not in body or not isinstance(body.get("markets"), list):
        raise BettingProsError("markets is missing; nothing written")
    props = list(body["props"])
    markets = list(body.get("markets") or [])
    page_counts = [len(props)]
    page_nos = [_echoed_page(body, 1)]
    seen_pages = {_page_fingerprint(props)}
    for n in range(2, total_pages + 1):
        sleep(2.0)
        nxt = _get_page(call, {**params, "page": str(n)}, key, sleep, f" page {n}")
        _check_echo(nxt, season, week)
        got = nxt.get("props")
        if not isinstance(got, list):
            raise BettingProsError("BettingPros /props props is not a list; nothing written")
        page_nos.append(_echoed_page(nxt, n))
        fingerprint = _page_fingerprint(got)
        if fingerprint in seen_pages:
            raise BettingProsError(f"_pagination page {n} repeats an earlier page; nothing written")
        seen_pages.add(fingerprint)
        page_counts.append(len(got))
        props.extend(got)
        extra = nxt.get("markets")
        if isinstance(extra, list):
            markets.extend(extra)
    total_items = int(page["total_items"])
    page_size = page_counts[0] if total_pages > 1 else int(page.get("limit") or 0)
    finished_walk(page_counts, page_nos, total_items, page_size)
    body["props"] = props
    body["markets"] = markets
    return body


def _market_index(markets: list) -> dict:
    by_id: dict = {}
    for market in markets:
        if not isinstance(market, dict) or "id" not in market:
            raise BettingProsError("BettingPros market has no id; nothing written")
        mid = market["id"]
        prev = by_id.get(mid)
        if prev is not None and prev != market:
            raise BettingProsError(f"market id {mid} has two market objects; nothing written")
        by_id[mid] = market
    return by_id


def _candidate_names(market: dict) -> list[tuple[str, object]]:
    meta = market.get("meta") if isinstance(market.get("meta"), dict) else {}
    return [
        ("market.stat", market.get("stat")),
        ("market.slug", market.get("slug")),
        ("market.meta.label", meta.get("label")),
        ("market.meta.short_label", meta.get("short_label")),
        ("market.meta.prop_full_label", meta.get("prop_full_label")),
        ("market.meta.prop_short_label", meta.get("prop_short_label")),
    ]


def market_to_stat(market: dict, known: set[str]) -> str | None:
    """Map one market object onto a fair stat. Unknown names return None. Conflicting names raise."""
    if "period" not in market:
        raise BettingProsError("market.period is missing; nothing written")
    if market.get("period") != "game":
        return None
    if "category" not in market:
        raise BettingProsError("market.category is missing; nothing written")
    if market.get("category") not in PLAYER_PROP_CATEGORIES:
        return None
    hits: list[tuple[str, str]] = []
    for field, value in _candidate_names(market):
        if value is None or str(value).strip() == "":
            continue
        stat = PHRASE_TO_STAT.get(_norm_market(value))
        if stat is None:
            continue
        if stat not in known or stat not in FAIR_STATS:
            continue
        hits.append((field, stat))
    if not hits:
        return None
    stats = {stat for _, stat in hits}
    if len(stats) > 1:
        fields = ", ".join(f"{field}={stat}" for field, stat in hits)
        raise BettingProsError(f"market id {market.get('id')} maps to {fields}; nothing written")
    return hits[0][1]


def _market_label(market: dict) -> str:
    meta = market.get("meta") if isinstance(market.get("meta"), dict) else {}
    for value in (market.get("slug"), meta.get("short_label"), meta.get("label"), market.get("stat")):
        if value is not None and str(value).strip():
            return str(value).strip()
    return str(market.get("id"))


def _side_line(side: dict) -> float | None:
    if "consensus_line" not in side or side.get("consensus_line") is None:
        return None
    try:
        return float(side["consensus_line"])
    except (TypeError, ValueError):
        raise BettingProsError(
            f"consensus_line is {side.get('consensus_line')!r}; nothing written"
        ) from None


def _prop_line(prop: dict) -> tuple[float, int | None, int | None] | None:
    over = prop.get("over") if isinstance(prop.get("over"), dict) else {}
    under = prop.get("under") if isinstance(prop.get("under"), dict) else {}
    over_line = _side_line(over)
    under_line = _side_line(under)
    if over_line is None and under_line is None:
        return None
    if over_line is not None and under_line is not None and over_line != under_line:
        raise BettingProsError(
            f"consensus_line over {over_line} != under {under_line}; nothing written"
        )
    line = over_line if over_line is not None else under_line
    over_odds = parse_odds(over.get("consensus_odds")) if over_line is not None else None
    under_odds = parse_odds(under.get("consensus_odds")) if under_line is not None else None
    return float(line), over_odds, under_odds


def map_props(body: dict, known_stats, fp_map: dict[str, str]) -> dict:
    props = body.get("props")
    markets = body.get("markets")
    if not isinstance(props, list):
        raise BettingProsError("BettingPros /props props is not a list; nothing written")
    if not props:
        raise BettingProsError("BettingPros /props props is empty; nothing written")
    if not isinstance(markets, list):
        raise BettingProsError("markets is missing; nothing written")
    known = set(known_stats)
    index = _market_index(markets)
    mapped: list[dict] = []
    rejected_markets: dict[str, int] = {}
    unmatched: list[dict] = []
    for prop in props:
        if not isinstance(prop, dict) or "market_id" not in prop:
            raise BettingProsError("market_id is missing; nothing written")
        mid = prop["market_id"]
        market = index.get(mid)
        if market is None:
            raise BettingProsError(f"market_id {mid} has no markets object; nothing written")
        stat = market_to_stat(market, known)
        if stat is None:
            label = _market_label(market)
            rejected_markets[label] = rejected_markets.get(label, 0) + 1
            continue
        participant = prop.get("participant")
        if not isinstance(participant, dict):
            raise BettingProsError("participant is missing; nothing written")
        if "id" not in participant:
            raise BettingProsError("participant.id is missing; nothing written")
        fp_id = participant.get("id")
        name = participant.get("name")
        if fp_id is None or str(fp_id).strip() == "":
            unmatched.append({
                "player": None if name is None else str(name),
                "fp_id": None,
                "reason": "participant.id",
                "stat": stat,
            })
            continue
        fp_id = str(fp_id).strip()
        if name is None or str(name).strip() == "":
            raise BettingProsError("participant.name is missing; nothing written")
        player = str(name).strip()
        priced = _prop_line(prop)
        if priced is None:
            unmatched.append({
                "player": player, "fp_id": fp_id, "reason": "consensus_line", "stat": stat,
            })
            continue
        line, over_odds, under_odds = priced
        gsis = fp_map.get(fp_id)
        if gsis is None:
            unmatched.append({
                "player": player, "fp_id": fp_id, "reason": "unmatched", "stat": stat,
            })
            continue
        mapped.append({
            "player_id": gsis,
            "player_name": player,
            "stat": stat,
            "line": line,
            "over_odds": over_odds,
            "under_odds": under_odds,
            "fp_id": fp_id,
        })
    if not mapped and not unmatched:
        labels = ", ".join(sorted(rejected_markets)) or "(none)"
        raise BettingProsError(f"no market name matched a fair stat ({labels}); nothing written")
    if not mapped and all(u["reason"] == "consensus_line" for u in unmatched):
        raise BettingProsError("consensus_line is missing; nothing written")
    seen: dict[tuple, dict] = {}
    for row in mapped:
        key = (row["player_id"], row["stat"])
        prev = seen.get(key)
        if prev is None:
            seen[key] = row
            continue
        same = (
            prev["line"] == row["line"]
            and prev["over_odds"] == row["over_odds"]
            and prev["under_odds"] == row["under_odds"]
        )
        if not same:
            raise BettingProsError(
                f"duplicate {row['player_name']} {row['stat']}; nothing written"
            )
    return {
        "mapped": list(seen.values()),
        "unmatched": unmatched,
        "rejected_markets": [
            {"market": k, "n": n}
            for k, n in sorted(rejected_markets.items(), key=lambda kv: (-kv[1], kv[0]))
        ],
    }


def load_fp_players() -> pl.DataFrame:
    return read_sql("select fantasypros_id, gsis_id from raw.players")


def run_api(
    season: int, week: int, *, api_key: str | None = None, transport=None,
    known_stats=None, players=None,
) -> dict:
    """HTTP twin of run(): same market_props rows, joined on fantasypros_id only."""
    stats = list(known_stats) if known_stats is not None else load_known_stats()
    if not stats:
        raise BettingProsError("model.fair_props has no stat; nothing written")
    body = fetch_props(season, week, api_key=api_key, transport=transport)
    frame = players if players is not None else load_fp_players()
    fp_map = build_fp_map(frame)
    classified = map_props(body, stats, fp_map)
    captured_at = _parse_utc(body)
    matched = classified["mapped"]
    written = persist(season, week, matched, captured_at) if matched else 0
    return {
        "season": season,
        "week": week,
        "captured_at": captured_at,
        "fair_stats": stats,
        "n_props": len(body["props"]),
        "n_mapped": len(matched) + len(classified["unmatched"]),
        "n_joined": len(matched),
        "written": written,
        "matched": matched,
        "unmatched": classified["unmatched"],
        "rejected_markets": classified["rejected_markets"],
        "stopped": written == 0,
    }
