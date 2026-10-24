"""DraftKings contest results: entry history and per-contest standings.

`draftkings-contest-entry-history.csv` -> raw.dk_entry_history (upsert on Entry_Key, never trimmed).
`contest-standings-<contest_key>.zip` -> raw.dk_contests / dk_contest_players / dk_contest_entries,
plus raw.dk_entry_slots for entries that appear in the history file.
`dk-ownership-<contest_key>.json` (ops/dk-ownership.js, gamecenter API) -> the same tables with
source='api' and no top-1% columns; for contests whose CSV export DK has already purged.

The standings CSV holds two tables side by side under one header: entries on the left, the
contest's player table (ownership and points) on the right. Any other header stops the load.
A player is listed once per roster slot he was drafted into, so the player key is
(contest_key, player_name, roster_position) and total ownership is the sum over slots.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import zipfile
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from zoneinfo import ZoneInfo

from ..db import ANALYZE_MIN_ROWS, conn, read_sql

HEADER = [
    "Rank", "EntryId", "EntryName", "TimeRemaining", "Points", "Lineup", "",
    "Player", "Roster Position", "%Drafted", "FPTS",
]
HISTORY_HEADER = [
    "Sport", "Game_Type", "Entry_Key", "Entry", "Contest_Key", "Contest_Date_EST", "Place",
    "Points", "Winnings_Non_Ticket", "Winnings_Ticket", "Contest_Entries", "Entry_Fee",
    "Prize_Pool", "Places_Paid",
]
SLOT_TOKENS = ("QB", "RB", "WR", "TE", "FLEX", "DST", "CPT")
_SLOT_RE = re.compile(r"(?:^|\s)(" + "|".join(SLOT_TOKENS) + r")\s+")
_FILE_RE = re.compile(r"contest-standings-(\d+)")
_ENTRY_SUFFIX_RE = re.compile(r"\s*\(\d+/\d+\)\s*$")
_EST = ZoneInfo("America/New_York")
SUM_TOLERANCE = 0.05
MIN_SLATE_COVERAGE = 0.99
# Contest names must also cover this share of the slate. The standings player table omits
# salary-file names nobody drafted, so a real Main contest covers about a third to three
# quarters of Main, not 90%. 0.32 keeps those (the smallest loaded Main contest is 0.328)
# and leaves a contest that only covers 30% of Main unresolved.
MIN_SLATE_FIT = 0.32
# API dumps only see players on the top ~500 rosters (190-210 names on a 520-670 name Main
# slate, 0.28-0.40), so their fit floor is lower. Coverage stays at 0.99.
MIN_API_SLATE_FIT = 0.20
CLASSIC_GAME = "Classic"
HISTORY_FILENAME = "draftkings-contest-entry-history.csv"


class DkFileError(ValueError):
    """A DraftKings file is not in the shape this loader locked on."""


# ---------------------------------------------------------------- parsing helpers

def money(raw: str | None) -> Decimal | None:
    s = (raw or "").strip().replace("$", "").replace(",", "")
    if not s:
        return None
    try:
        return Decimal(s)
    except InvalidOperation:
        raise DkFileError(f"unreadable money value {raw!r}") from None


def fraction(raw: str | None) -> Decimal | None:
    """'35.11%' -> 0.3511."""
    s = (raw or "").strip().rstrip("%").strip()
    if not s:
        return None
    try:
        return (Decimal(s) / Decimal(100)).quantize(Decimal("0.000001"))
    except InvalidOperation:
        raise DkFileError(f"unreadable percentage {raw!r}") from None


def number(raw: str | None) -> Decimal | None:
    s = (raw or "").strip()
    if not s:
        return None
    try:
        return Decimal(s)
    except InvalidOperation:
        raise DkFileError(f"unreadable number {raw!r}") from None


def _int(raw: str | None) -> int | None:
    s = (raw or "").strip().replace(",", "")
    return int(s) if s else None


def parse_lineup(text: str) -> list[tuple[str, str]]:
    """'DST Chiefs  FLEX Tre Tucker QB Jameis Winston ...' -> [(slot, player), ...] in file order."""
    text = (text or "").strip()
    marks = list(_SLOT_RE.finditer(text))
    out: list[tuple[str, str]] = []
    for i, m in enumerate(marks):
        end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
        name = text[m.end():end].strip()
        if not name:
            raise DkFileError(f"lineup slot {m.group(1)} has no player: {text!r}")
        out.append((m.group(1), name))
    return out


def contest_key_from_name(name: str) -> int:
    m = _FILE_RE.search(Path(name).name)
    if not m:
        raise DkFileError(f"cannot read a contest id from {name!r} (expected contest-standings-<id>)")
    return int(m.group(1))


# ---------------------------------------------------------------- folder scan

@dataclass
class ScanRow:
    contest_key: int
    status: str          # ready | unchanged | loaded | empty | unreadable | conflict | not-classic | error
    path: Path | None = None
    size: int = 0
    game_type: str | None = None
    no_history: bool = False
    note: str = ""
    skipped: list[str] = field(default_factory=list)


def _copy_rank(path: Path) -> tuple:
    """Zip beats a loose CSV. A browser ' (1)' copy loses to the plain name."""
    copy = " (" in path.stem
    return (0 if path.suffix.lower() == ".zip" else 1, 1 if copy else 0, path.name)


def standings_bytes(path: Path) -> bytes:
    """CSV bytes a standings file would load. Raises DkFileError on a bad zip."""
    if path.stat().st_size == 0:
        return b""
    if path.suffix.lower() != ".zip":
        return path.read_bytes()
    try:
        with zipfile.ZipFile(path) as z:
            names = [n for n in z.namelist() if n.lower().endswith(".csv")]
            if len(names) != 1:
                raise DkFileError(f"{path.name}: expected one CSV in the zip, found {len(names)}")
            return z.read(names[0])
    except zipfile.BadZipFile as e:
        raise DkFileError(f"{path.name}: not a zip") from e


def _classify_key(contest_key: int, paths: list[Path], hist: dict | None) -> ScanRow:
    game_type = hist.get("game_type") if hist else None
    no_history = hist is None
    base = {"contest_key": contest_key, "game_type": game_type, "no_history": no_history}
    if hist and hist.get("mixed"):
        return ScanRow(status="error", note="history rows disagree on game type", **base)
    empty = [p.name for p in paths if p.stat().st_size == 0]
    nonempty = [p for p in paths if p.stat().st_size > 0]
    if not nonempty:
        return ScanRow(status="empty", note="0 bytes", skipped=empty, **base)

    readable: list[tuple[Path, bytes]] = []
    bad: list[str] = []
    for p in nonempty:
        try:
            readable.append((p, standings_bytes(p)))
        except DkFileError as e:
            bad.append(str(e))
    if not readable:
        return ScanRow(status="unreadable", note="; ".join(bad), skipped=empty, **base)

    distinct = {b for _, b in readable}
    names = ", ".join(p.name for p, _ in readable)
    if len(distinct) > 1:
        return ScanRow(status="conflict", note=f"copies differ: {names}", skipped=empty, **base)

    chosen = min(readable, key=lambda item: _copy_rank(item[0]))[0]
    skipped = [p.name for p, _ in readable if p != chosen] + empty
    note = ""
    if skipped:
        note = "duplicate skipped: " + ", ".join(skipped)
    if bad:
        note = (note + "; " if note else "") + "; ".join(bad)
    if game_type and game_type != CLASSIC_GAME:
        return ScanRow(status="not-classic", path=chosen, size=chosen.stat().st_size,
                       note=game_type, skipped=skipped, **base)
    return ScanRow(status="ready", path=chosen, size=chosen.stat().st_size,
                   note=note, skipped=skipped, **base)


def scan_folder(directory: Path, history: dict[int, dict] | None = None) -> list[ScanRow]:
    """One row per contest key. `history` maps contest_key to a row with game_type.

    A key missing from `history` still comes back `ready` (or empty) with no_history set.
    """
    history = history or {}
    groups: dict[int, list[Path]] = defaultdict(list)
    for p in sorted(Path(directory).iterdir()):
        if p.is_file() and _FILE_RE.search(p.name):
            groups[contest_key_from_name(p.name)].append(p)
    return [_classify_key(k, groups[k], history.get(k)) for k in sorted(groups)]


def standings_keys(directory: Path) -> list[int]:
    keys = {
        contest_key_from_name(p.name)
        for p in Path(directory).iterdir()
        if p.is_file() and _FILE_RE.search(p.name)
    }
    return sorted(keys)


def history_brief(rows: list[dict]) -> dict:
    """One history row's fields for classification. Game type must agree across the contest."""
    types = {r.get("game_type") for r in rows}
    first = rows[0]
    return {
        "game_type": first.get("game_type"),
        "contest_time": first.get("contest_time"),
        "entry_name": first.get("entry_name"),
        "contest_entries": first.get("contest_entries"),
        "sport": first.get("sport"),
        "mixed": len(types) > 1,
    }


def gap_contests(rows: list[dict], present: set[int], start, end) -> list[dict]:
    """NFL Classic history contests in [start, end] with no standings file in the folder."""
    best: dict[int, dict] = {}
    for r in rows:
        if r.get("sport") != "NFL" or r.get("game_type") != CLASSIC_GAME:
            continue
        when = r.get("contest_time")
        if when is None or when < start or when > end:
            continue
        key = int(r["contest_key"])
        if key in present:
            continue
        best.setdefault(key, r)
    return [best[k] for k in sorted(best, key=lambda k: (best[k]["contest_time"], k))]


# ---------------------------------------------------------------- entry history

def parse_history(text: str) -> list[dict]:
    reader = csv.reader(io.StringIO(text.lstrip("\ufeff")))
    header = next(reader, None)
    if header != HISTORY_HEADER:
        raise DkFileError(f"unknown entry-history header: {header!r}")
    out = []
    for i, row in enumerate(reader, start=2):
        if not row:
            continue
        if len(row) != len(HISTORY_HEADER):
            raise DkFileError(f"entry-history line {i} has {len(row)} fields, expected {len(HISTORY_HEADER)}")
        r = dict(zip(HISTORY_HEADER, row, strict=True))
        when = None
        if r["Contest_Date_EST"].strip():
            when = datetime.strptime(r["Contest_Date_EST"].strip(), "%Y-%m-%d %H:%M:%S").replace(tzinfo=_EST)
        out.append({
            "entry_key": int(r["Entry_Key"]),
            "sport": r["Sport"],
            "game_type": r["Game_Type"],
            "entry_name": r["Entry"],
            "contest_key": int(r["Contest_Key"]),
            "contest_time": when,
            "place": _int(r["Place"]),
            "points": number(r["Points"]),
            "winnings_cash": money(r["Winnings_Non_Ticket"]) or Decimal(0),
            "winnings_ticket": money(r["Winnings_Ticket"]) or Decimal(0),
            "contest_entries": _int(r["Contest_Entries"]),
            "entry_fee": money(r["Entry_Fee"]),
            "prize_pool": money(r["Prize_Pool"]),
            "places_paid": _int(r["Places_Paid"]),
        })
    keys = [r["entry_key"] for r in out]
    if len(keys) != len(set(keys)):
        raise DkFileError("entry-history has duplicate Entry_Key values")
    return out


_HISTORY_COLS = [
    "entry_key", "sport", "game_type", "entry_name", "contest_key", "contest_time", "place", "points",
    "winnings_cash", "winnings_ticket", "contest_entries", "entry_fee", "prize_pool", "places_paid",
]


def load_history(path: Path) -> dict:
    rows = parse_history(path.read_text(encoding="utf-8"))
    if not rows:
        raise DkFileError("entry-history file has no rows")
    cols = ",".join(_HISTORY_COLS)
    sets = ",".join(f"{c}=excluded.{c}" for c in _HISTORY_COLS[1:])
    with conn() as c, c.cursor() as cur:
        cur.execute("create temp table _stg_hist on commit drop as "
                    f"select {cols} from raw.dk_entry_history where false")
        with cur.copy(f"copy _stg_hist ({cols}) from stdin") as cp:
            for r in rows:
                cp.write_row(tuple(r[k] for k in _HISTORY_COLS))
        cur.execute(f"insert into raw.dk_entry_history ({cols}) select {cols} from _stg_hist "
                    f"on conflict (entry_key) do update set {sets}, ingested_at = now()")
        c.commit()
    return {"rows": len(rows), "contests": len({r["contest_key"] for r in rows})}


# ---------------------------------------------------------------- standings

@dataclass
class Standings:
    entries: list[dict]            # rank, entry_id, entry_name, points, lineup
    players: list[dict]            # player_name, roster_position, pct_drafted, fpts
    skipped_entry_rows: int = 0


def parse_standings(text: str) -> Standings:
    reader = csv.reader(io.StringIO(text.lstrip("\ufeff")))
    header = next(reader, None)
    if header != HEADER:
        raise DkFileError(f"unknown standings header: {header!r}; expected {HEADER!r}")
    entries: list[dict] = []
    players: list[dict] = []
    for i, row in enumerate(reader, start=2):
        if not any(c.strip() for c in row):
            continue
        row = (row + [""] * len(HEADER))[: len(HEADER)]
        rank, eid, ename, _tr, pts, lineup, _gap, pname, ppos, pdraft, pfpts = row
        if eid.strip():
            if not rank.strip():
                raise DkFileError(f"standings line {i}: entry {eid} has no rank")
            entries.append({
                "rank": int(rank), "entry_id": int(eid), "entry_name": ename.strip() or None,
                "points": number(pts), "lineup": lineup.strip(),
            })
        if pname.strip():
            if not ppos.strip():
                raise DkFileError(f"standings line {i}: player {pname!r} has no roster position")
            players.append({
                "player_name": pname.strip(), "roster_position": ppos.strip(),
                "pct_drafted": fraction(pdraft), "fpts": number(pfpts),
            })
    if not entries:
        raise DkFileError("standings file has no entries")
    ids = [e["entry_id"] for e in entries]
    if len(ids) != len(set(ids)):
        raise DkFileError("standings file has duplicate EntryId values")
    keys = [(p["player_name"], p["roster_position"]) for p in players]
    if len(keys) != len(set(keys)):
        raise DkFileError("standings player table repeats a (player, roster position)")
    if any(p["pct_drafted"] is None for p in players):
        raise DkFileError("standings player table has a blank %Drafted")
    return Standings(entries=entries, players=players)


def read_source(path: Path) -> tuple[str, str]:
    """(csv text, sha256 of the file on disk). A zip must hold exactly one CSV."""
    raw = path.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(io.BytesIO(raw)) as z:
            names = [n for n in z.namelist() if n.lower().endswith(".csv")]
            if len(names) != 1:
                raise DkFileError(f"{path.name}: expected one CSV in the zip, found {len(names)}")
            return z.read(names[0]).decode("utf-8"), sha
    return raw.decode("utf-8"), sha


def top1_line(entries: list[dict]) -> tuple[int, Decimal]:
    """(rank, points) at rank floor(n/100), min 1. Ties at that score all count as top 1%."""
    ranked = sorted((e for e in entries if e["points"] is not None), key=lambda e: e["rank"])
    if not ranked:
        raise DkFileError("no scored entries")
    rank = max(len(entries) // 100, 1)
    at = [e for e in ranked if e["rank"] <= rank]
    if not at:
        raise DkFileError(f"no entry at or above rank {rank}")
    last = at[-1]
    return last["rank"], last["points"]


def cash_line(entries: list[dict], places_paid: int | None) -> Decimal | None:
    """Points on the last standings rank still inside the paid count. Ties ranked past it do not cash."""
    if not places_paid:
        return None
    inside = [e for e in entries if e["rank"] <= places_paid and e["points"] is not None]
    if not inside:
        return None
    return max(inside, key=lambda e: e["rank"])["points"]


def player_top1_rates(entries: list[dict], score: Decimal) -> dict[tuple[str, str], Decimal]:
    """(player, slot) -> share of entries at or above `score` that rostered him in that slot."""
    top = [e for e in entries if e["points"] is not None and e["points"] >= score]
    counts: dict[tuple[str, str], int] = defaultdict(int)
    for e in top:
        for slot, name in parse_lineup(e["lineup"]):
            counts[(name, slot)] += 1
    n = len(top)
    return {k: (Decimal(v) / Decimal(n)).quantize(Decimal("0.000001")) for k, v in counts.items()}


def fpts_map(players: list[dict]) -> dict[str, Decimal]:
    out: dict[str, Decimal] = {}
    for p in players:
        if p["fpts"] is not None:
            out[p["player_name"]] = p["fpts"]
    return out


def resolve_slate_id(names: set[str], slates: dict[str, set[str]], min_fit: float = MIN_SLATE_FIT) -> str | None:
    """Smallest model slate that covers the contest, and that the contest covers back.

    Coverage is one way: a primetime contest's names all sit on Main, so Main would win
    whenever the primetime salary file is missing. The fit check requires the contest to
    cover MIN_SLATE_FIT of the slate's own names. No such slate leaves the id null.
    """
    if not names:
        return None
    scored = []
    for sid, have in slates.items():
        if not have:
            continue
        both = names & have
        cov = len(both) / len(names)
        fit = len(both) / len(have)
        if cov >= MIN_SLATE_COVERAGE and fit >= min_fit:
            scored.append((-round(cov, 4), len(have), sid))
    return min(scored)[2] if scored else None


def entry_slots(entry: dict, fpts: dict[str, Decimal], position: dict[str, str]) -> dict:
    """Break one entry into slot rows. Returns {'slots': [...]} or {'miss': reason}."""
    try:
        parsed = parse_lineup(entry["lineup"])
    except DkFileError as e:
        return {"miss": str(e)}
    if not parsed:
        return {"miss": "empty lineup"}
    rows = []
    missing = [name for _, name in parsed if name not in fpts]
    if missing:
        return {"miss": f"no contest FPTS for {', '.join(missing)}"}
    for i, (slot, name) in enumerate(parsed, start=1):
        rows.append({"slot_order": i, "slot": slot, "position": position.get(name),
                     "player_name": name, "fpts": fpts[name]})
    total = sum((r["fpts"] for r in rows), Decimal(0))
    if entry["points"] is None or abs(float(total - entry["points"])) > SUM_TOLERANCE:
        return {"miss": f"slot FPTS sum {total} does not match Points {entry['points']}"}
    return {"slots": rows}


# ---------------------------------------------------------------- database

@dataclass
class ContestResult:
    contest_key: int
    status: str                      # loaded | unchanged
    entries: int = 0
    players: int = 0
    mine: int = 0
    slot_entries: int = 0
    top1_score: Decimal | None = None
    cash_score: Decimal | None = None
    slate_id: str | None = None
    contest_name: str | None = None
    history_entries: int | None = None
    misses: list[tuple[int, str]] = field(default_factory=list)


def _history_for(contest_key: int) -> list[dict]:
    df = read_sql(
        "select entry_key, entry_name, contest_entries, places_paid from raw.dk_entry_history "
        "where contest_key = %s", (contest_key,))
    return df.to_dicts()


def _salary_slates() -> dict[str, set[str]]:
    df = read_sql(
        "select slate_id, name from raw.dk_salaries "
        "where site = 'dk' and slate_type = 'classic' and roster_position <> 'CPT'")
    out: dict[str, set[str]] = defaultdict(set)
    for r in df.to_dicts():
        out[r["slate_id"]].add(str(r["name"]).strip())
    return out


def ingest_standings(
    path: Path,
    slate_id: str | None = None,
    force: bool = False,
    history: list[dict] | None = None,
    slates: dict[str, set[str]] | None = None,
) -> ContestResult:
    contest_key = contest_key_from_name(path.name)
    text, sha = read_source(path)
    prior = read_sql("select source_sha256 from raw.dk_contests where contest_key = %s", (contest_key,))
    if not prior.is_empty() and prior[0, "source_sha256"] == sha and not force:
        return ContestResult(contest_key=contest_key, status="unchanged")

    st = parse_standings(text)
    hist = _history_for(contest_key) if history is None else history
    places_paid = None
    if hist:
        paid = {h["places_paid"] for h in hist if h["places_paid"] is not None}
        if len(paid) > 1:
            raise DkFileError(f"contest {contest_key}: history rows disagree on Places_Paid {sorted(paid)}")
        places_paid = paid.pop() if paid else None
    top_rank, top_score = top1_line(st.entries)
    cash = cash_line(st.entries, places_paid)
    rates = player_top1_rates(st.entries, top_score)
    fpts = fpts_map(st.players)
    position = {p["player_name"]: p["roster_position"] for p in st.players if p["roster_position"] != "FLEX"}
    sid = slate_id or resolve_slate_id(set(fpts), slates if slates is not None else _salary_slates())

    name = None
    for h in hist:
        name = _ENTRY_SUFFIX_RE.sub("", h["entry_name"] or "") or None
        if name:
            break
    res = ContestResult(
        contest_key=contest_key, status="loaded", entries=len(st.entries), players=len(st.players),
        top1_score=top_score, cash_score=cash, slate_id=sid, contest_name=name,
        history_entries=next((h["contest_entries"] for h in hist if h["contest_entries"]), None),
    )

    mine_ids = {h["entry_key"] for h in hist}
    slot_rows: list[tuple] = []
    for e in st.entries:
        if e["entry_id"] not in mine_ids:
            continue
        res.mine += 1
        out = entry_slots(e, fpts, position)
        if "miss" in out:
            res.misses.append((e["entry_id"], out["miss"]))
            continue
        res.slot_entries += 1
        for s in out["slots"]:
            slot_rows.append((e["entry_id"], s["slot_order"], contest_key, s["slot"], s["position"],
                              s["player_name"], s["fpts"]))

    with conn() as c, c.cursor() as cur:
        cur.execute("delete from raw.dk_contests where contest_key = %s", (contest_key,))
        cur.execute(
            "insert into raw.dk_contests (contest_key, contest_name, entries, places_paid, top1_rank, "
            "top1_score, cash_score, slate_id, source_file, source_sha256) "
            "values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
            (contest_key, name, len(st.entries), places_paid, top_rank, top_score, cash,
             sid, path.name, sha))
        with cur.copy("copy raw.dk_contest_players (contest_key, player_name, roster_position, "
                      "pct_drafted, fpts, top1_rate) from stdin") as cp:
            for p in st.players:
                cp.write_row((contest_key, p["player_name"], p["roster_position"], p["pct_drafted"],
                              p["fpts"], rates.get((p["player_name"], p["roster_position"]), Decimal(0))))
        with cur.copy("copy raw.dk_contest_entries (contest_key, entry_id, rank, entry_name, points, "
                      "lineup) from stdin") as cp:
            for e in st.entries:
                cp.write_row((contest_key, e["entry_id"], e["rank"], e["entry_name"], e["points"],
                              e["lineup"]))
        if slot_rows:
            with cur.copy("copy raw.dk_entry_slots (entry_key, slot_order, contest_key, slot, position, "
                          "player_name, fpts) from stdin") as cp:
                for r in slot_rows:
                    cp.write_row(r)
        c.commit()
        if len(st.entries) >= ANALYZE_MIN_ROWS:
            for table in ("raw.dk_contest_entries", "raw.dk_contest_players", "raw.dk_entry_slots"):
                cur.execute(f"analyze {table}")
            c.commit()
    return res


# ---------------------------------------------------------------- gamecenter API ownership

@dataclass
class OwnershipDump:
    """One contest pulled by ops/dk-ownership.js: top-~500 entries plus DK's per-player totals."""
    contest_key: int
    entries: list[dict]            # rank, entry_id, entry_name, points, lineup
    players: list[dict]            # player_name, roster_position (non-FLEX), pct_drafted, fpts
    cash_score: Decimal | None


def parse_ownership_json(text: str) -> list[OwnershipDump]:
    """A dk-ownership JSON file holds one contest object or a dict of them keyed by contest key.

    `percentDrafted` in the API is the player's contest-wide total (the same number on his RB and
    FLEX rows), so the player table collapses to one row per player under his non-FLEX position.
    A player seen only at FLEX keeps roster_position None; the loader fills it from the slate's
    salary file and refuses the contest if it cannot.
    """
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise DkFileError(f"not JSON: {e}") from None
    objs = [data] if isinstance(data, dict) and "ck" in data else list(data.values()) if isinstance(data, dict) else None
    if not objs:
        raise DkFileError("ownership JSON has no contest objects (expected keys ck, rows, players)")
    out: list[OwnershipDump] = []
    for d in objs:
        for k in ("ck", "rows", "players"):
            if k not in d:
                raise DkFileError(f"ownership JSON object missing {k!r}")
        ck = int(d["ck"])
        entries = []
        for r in d["rows"]:
            entries.append({
                "rank": int(r["rank"]), "entry_id": int(r["entryKey"]),
                "entry_name": (r.get("user") or "").strip() or None,
                "points": Decimal(str(r["pts"])) if r.get("pts") is not None else None,
                "lineup": (r.get("lineup") or "").strip(),
            })
        if not entries:
            raise DkFileError(f"contest {ck}: no leaderboard rows")
        ids = [e["entry_id"] for e in entries]
        if len(ids) != len(set(ids)):
            raise DkFileError(f"contest {ck}: duplicate entry keys")
        by_name: dict[str, dict] = {}
        for p in d["players"]:
            name = str(p["name"]).strip()
            if p.get("own") is None:
                raise DkFileError(f"contest {ck}: {name!r} has no percentDrafted")
            own = (Decimal(str(p["own"])) / Decimal(100)).quantize(Decimal("0.000001"))
            row = by_name.setdefault(name, {"player_name": name, "roster_position": None,
                                            "pct_drafted": own, "fpts": None})
            if row["pct_drafted"] != own:
                raise DkFileError(f"contest {ck}: {name!r} has two different percentDrafted values")
            if p.get("fpts") is not None:
                row["fpts"] = Decimal(str(p["fpts"]))
            if p.get("pos") and p["pos"] != "FLEX":
                row["roster_position"] = p["pos"]
        if not by_name:
            raise DkFileError(f"contest {ck}: no player rows")
        cash = d.get("cash")
        out.append(OwnershipDump(
            contest_key=ck, entries=entries, players=list(by_name.values()),
            cash_score=Decimal(str(cash)) if cash is not None else None,
        ))
    return out


def _salary_positions(slate_id: str) -> dict[str, str]:
    df = read_sql(
        "select name, min(position) as position from raw.dk_salaries "
        "where site = 'dk' and slate_id = %s and position is not null group by name", (slate_id,))
    return {str(r["name"]).strip(): str(r["position"]) for r in df.to_dicts()}


def ingest_ownership(path: Path, slate_id: str | None = None, force: bool = False) -> list[ContestResult]:
    """dk-ownership JSON -> raw.dk_contests (source='api') + dk_contest_players + dk_contest_entries.

    Field size comes from raw.dk_entry_history (the API dump only has the top ~500), so a contest
    with no history row is refused. top1 columns stay null: the 99th-percentile line needs the
    full field. A contest already loaded from a full standings CSV is left alone unless --force.
    """
    raw = path.read_bytes()
    sha = hashlib.sha256(raw).hexdigest()
    dumps = parse_ownership_json(raw.decode("utf-8"))
    slates = _salary_slates()
    results: list[ContestResult] = []
    for dump in dumps:
        ck = dump.contest_key
        prior = read_sql("select source_sha256, source from raw.dk_contests where contest_key = %s", (ck,))
        if not prior.is_empty() and not force:
            if prior[0, "source"] == "standings":
                results.append(ContestResult(contest_key=ck, status="unchanged"))
                continue
            if prior[0, "source_sha256"] == sha:
                results.append(ContestResult(contest_key=ck, status="unchanged"))
                continue
        hist = _history_for(ck)
        field_size = next((h["contest_entries"] for h in hist if h["contest_entries"]), None)
        if not field_size:
            raise DkFileError(f"contest {ck}: no raw.dk_entry_history row with Contest_Entries; "
                              "load dk-history first")
        paid = {h["places_paid"] for h in hist if h["places_paid"] is not None}
        if len(paid) > 1:
            raise DkFileError(f"contest {ck}: history rows disagree on Places_Paid {sorted(paid)}")
        places_paid = paid.pop() if paid else None
        fpts = fpts_map(dump.players)
        sid = slate_id or resolve_slate_id(set(fpts), slates, min_fit=MIN_API_SLATE_FIT)
        flex_only = [p for p in dump.players if p["roster_position"] is None]
        if flex_only:
            if sid is None:
                raise DkFileError(f"contest {ck}: no slate resolved, cannot place FLEX-only players "
                                  f"({', '.join(p['player_name'] for p in flex_only)})")
            pos = _salary_positions(sid)
            missing = [p["player_name"] for p in flex_only if p["player_name"] not in pos]
            if missing:
                raise DkFileError(f"contest {ck}: FLEX-only players not in {sid} salaries: {', '.join(missing)}")
            for p in flex_only:
                p["roster_position"] = pos[p["player_name"]]
        position = {p["player_name"]: p["roster_position"] for p in dump.players}
        name = next((_ENTRY_SUFFIX_RE.sub("", h["entry_name"] or "") or None for h in hist), None)
        res = ContestResult(contest_key=ck, status="loaded", entries=field_size, players=len(dump.players),
                            cash_score=dump.cash_score, slate_id=sid, contest_name=name,
                            history_entries=field_size)
        mine_ids = {h["entry_key"] for h in hist}
        slot_rows: list[tuple] = []
        for e in dump.entries:
            if e["entry_id"] not in mine_ids:
                continue
            res.mine += 1
            out = entry_slots(e, fpts, position)
            if "miss" in out:
                res.misses.append((e["entry_id"], out["miss"]))
                continue
            res.slot_entries += 1
            for s in out["slots"]:
                slot_rows.append((e["entry_id"], s["slot_order"], ck, s["slot"], s["position"],
                                  s["player_name"], s["fpts"]))
        with conn() as c, c.cursor() as cur:
            cur.execute("delete from raw.dk_contests where contest_key = %s", (ck,))
            cur.execute(
                "insert into raw.dk_contests (contest_key, contest_name, entries, places_paid, top1_rank, "
                "top1_score, cash_score, slate_id, source_file, source_sha256, source) "
                "values (%s,%s,%s,%s,null,null,%s,%s,%s,%s,'api')",
                (ck, name, field_size, places_paid, dump.cash_score, sid, path.name, sha))
            with cur.copy("copy raw.dk_contest_players (contest_key, player_name, roster_position, "
                          "pct_drafted, fpts, top1_rate) from stdin") as cp:
                for p in dump.players:
                    cp.write_row((ck, p["player_name"], p["roster_position"], p["pct_drafted"], p["fpts"], None))
            with cur.copy("copy raw.dk_contest_entries (contest_key, entry_id, rank, entry_name, points, "
                          "lineup) from stdin") as cp:
                for e in dump.entries:
                    cp.write_row((ck, e["entry_id"], e["rank"], e["entry_name"], e["points"], e["lineup"]))
            if slot_rows:
                with cur.copy("copy raw.dk_entry_slots (entry_key, slot_order, contest_key, slot, position, "
                              "player_name, fpts) from stdin") as cp:
                    for r in slot_rows:
                        cp.write_row(r)
            c.commit()
        results.append(res)
    return results


def _group_history(rows: list[dict]) -> dict[int, list[dict]]:
    out: dict[int, list[dict]] = defaultdict(list)
    for r in rows:
        out[int(r["contest_key"])].append(r)
    return out


def history_by_contest(keys: list[int]) -> dict[int, list[dict]]:
    """One query for every contest in the folder. Empty key list does not touch the database."""
    if not keys:
        return {}
    df = read_sql(
        "select entry_key, entry_name, contest_key, contest_entries, places_paid, "
        "game_type, sport, contest_time from raw.dk_entry_history "
        "where contest_key = any(%s)",
        (list(keys),),
    )
    return _group_history(df.to_dicts())


def _prior_sha(keys: list[int]) -> dict[int, str]:
    if not keys:
        return {}
    df = read_sql(
        "select contest_key, source_sha256 from raw.dk_contests where contest_key = any(%s)",
        (list(keys),),
    )
    return {int(r["contest_key"]): str(r["source_sha256"]) for r in df.to_dicts()}


def _gap_from_db(start, end, present: set[int]) -> list[dict]:
    df = read_sql(
        "select contest_key, min(entry_name) as entry_name, min(contest_time) as contest_time, "
        "max(contest_entries) as contest_entries, min(game_type) as game_type, min(sport) as sport "
        "from raw.dk_entry_history "
        "where sport = 'NFL' and game_type = 'Classic' "
        "and contest_time >= %s and contest_time <= %s "
        "group by contest_key",
        (start, end),
    )
    return gap_contests(df.to_dicts(), present, start, end)


def load_folder(directory: Path, *, dry_run: bool = False, force: bool = False) -> dict:
    """History upsert, then one standings load per usable classic file.

    Parsing and the slate match happen inside ingest_standings before its transaction.
    Salary slates are read once. A contest whose file sha is already stored is not rewritten.
    """
    directory = Path(directory)
    hist_path = directory / HISTORY_FILENAME
    parsed: list[dict] | None = None
    history_meta = None
    if hist_path.is_file() and hist_path.stat().st_size > 0:
        parsed = parse_history(hist_path.read_text(encoding="utf-8"))
        if dry_run:
            history_meta = {
                "rows": len(parsed),
                "contests": len({r["contest_key"] for r in parsed}),
                "dry_run": True,
            }
        else:
            history_meta = {**load_history(hist_path), "dry_run": False}
        by_key = _group_history(parsed)
    else:
        by_key = history_by_contest(standings_keys(directory))

    keys = standings_keys(directory)
    briefs = {k: history_brief(by_key[k]) for k in keys if k in by_key}
    rows = scan_folder(directory, briefs)
    present = {r.contest_key for r in rows}
    times = [
        by_key[k][0]["contest_time"]
        for k in present
        if k in by_key and by_key[k][0].get("contest_time") is not None
    ]
    if not times:
        gaps: list[dict] = []
    elif parsed is not None:
        gaps = gap_contests(parsed, present, min(times), max(times))
    else:
        gaps = _gap_from_db(min(times), max(times), present)

    ready = [r for r in rows if r.status == "ready"]
    prior = _prior_sha([r.contest_key for r in ready]) if ready else {}
    slates: dict[str, set[str]] | None = None
    results: list[ContestResult] = []
    for row in sorted(ready, key=lambda r: (r.size, r.contest_key)):
        assert row.path is not None
        sha = hashlib.sha256(row.path.read_bytes()).hexdigest()
        if not force and prior.get(row.contest_key) == sha:
            row.status = "unchanged"
            continue
        if dry_run:
            continue
        if slates is None:
            slates = _salary_slates()
        try:
            res = ingest_standings(
                row.path, force=force, history=by_key.get(row.contest_key, []), slates=slates,
            )
        except (DkFileError, RuntimeError) as e:
            row.status = "error"
            row.note = str(e)
            continue
        row.status = res.status
        if row.no_history and row.status == "loaded":
            extra = "no history row"
            row.note = f"{row.note}; {extra}" if row.note else extra
        results.append(res)
    failed = any(r.status in {"unreadable", "conflict", "error"} for r in rows)
    return {
        "history": history_meta,
        "history_missing": history_meta is None,
        "rows": rows,
        "results": results,
        "gaps": gaps,
        "failed": failed,
    }


__all__ = [
    "DkFileError", "ScanRow", "Standings", "cash_line", "contest_key_from_name", "entry_slots",
    "fpts_map", "gap_contests", "history_by_contest", "ingest_ownership", "ingest_standings",
    "load_folder", "load_history", "parse_history", "parse_lineup", "parse_ownership_json",
    "parse_standings", "player_top1_rates",
    "resolve_slate_id", "scan_folder", "top1_line",
]
