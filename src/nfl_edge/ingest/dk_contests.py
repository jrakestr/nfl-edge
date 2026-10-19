"""DraftKings contest results: entry history and per-contest standings.

`draftkings-contest-entry-history.csv` -> raw.dk_entry_history (upsert on Entry_Key, never trimmed).
`contest-standings-<contest_key>.zip` -> raw.dk_contests / dk_contest_players / dk_contest_entries,
plus raw.dk_entry_slots for entries that appear in the history file.

The standings CSV holds two tables side by side under one header: entries on the left, the
contest's player table (ownership and points) on the right. Any other header stops the load.
A player is listed once per roster slot he was drafted into, so the player key is
(contest_key, player_name, roster_position) and total ownership is the sum over slots.
"""
from __future__ import annotations

import csv
import hashlib
import io
import re
import zipfile
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from zoneinfo import ZoneInfo

from ..db import conn, read_sql

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


def resolve_slate_id(names: set[str], slates: dict[str, set[str]]) -> str | None:
    """Smallest model slate whose salary names cover (almost) every contest player."""
    if not names:
        return None
    scored = []
    for sid, have in slates.items():
        cov = len(names & have) / len(names)
        if cov >= MIN_SLATE_COVERAGE:
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


def ingest_standings(path: Path, slate_id: str | None = None, force: bool = False) -> ContestResult:
    contest_key = contest_key_from_name(path.name)
    text, sha = read_source(path)
    prior = read_sql("select source_sha256 from raw.dk_contests where contest_key = %s", (contest_key,))
    if not prior.is_empty() and prior[0, "source_sha256"] == sha and not force:
        return ContestResult(contest_key=contest_key, status="unchanged")

    st = parse_standings(text)
    hist = _history_for(contest_key)
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
    sid = slate_id or resolve_slate_id(set(fpts), _salary_slates())

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
        cur.execute("analyze raw.dk_contest_entries")
        c.commit()
    return res


__all__ = [
    "DkFileError", "Standings", "cash_line", "contest_key_from_name", "entry_slots", "fpts_map",
    "ingest_standings", "load_history", "parse_history", "parse_lineup", "parse_standings",
    "player_top1_rates", "resolve_slate_id", "top1_line",
]
