"""Audit DK lineups against site rules without the solver.

Deliberately independent of NFL-DFS-Tools and the cross-slate MILP: salary, position,
team and game come from `raw.dk_salaries` rows keyed by DK ID, never from the optimizer
CSV. Used on every pipeline build before persist/upload and by `nfl-edge dfs-validate`.
"""
from __future__ import annotations

import csv
import re
from pathlib import Path

from ..ingest.dk_salaries import parse_game_info

SALARY_CAP = 50_000
CLASSIC_SLOTS = ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "DST"]
SHOWDOWN_SLOTS = ["CPT", "FLEX", "FLEX", "FLEX", "FLEX", "FLEX"]
FLEX_POSITIONS = {"RB", "WR", "TE"}
CLASSIC_MIN_GAMES = 2
SHOWDOWN_MIN_TEAMS = 2

_SLOT_SUFFIX = re.compile(r"\d+$")
_CELL_ID = re.compile(r"^(?P<name>.*)\s+\((?P<id>[^)]+)\)\s*$")


def slate_index(rows: list[dict]) -> dict[str, dict]:
    """raw.dk_salaries rows keyed by DK ID (string)."""
    out: dict[str, dict] = {}
    for r in rows:
        dk = str(r.get("player_dk_id") or "").strip()
        if dk:
            out[dk] = r
    return out


def _slot(raw: str) -> str:
    return _SLOT_SUFFIX.sub("", str(raw or "").strip().upper())


def _person(row: dict) -> str:
    pid = row.get("player_id")
    if pid:
        return str(pid)
    return f"{row.get('name')}|{row.get('team')}"


def validate_lineup(lineup: dict, slate: dict[str, dict], slate_type: str = "classic") -> list[str]:
    """Every violated DK rule as text; empty list means legal."""
    showdown = slate_type == "showdown"
    expected = SHOWDOWN_SLOTS if showdown else CLASSIC_SLOTS
    ids = [str(d or "").strip() for d in (lineup.get("dk_ids") or [])]
    slots = [_slot(s) for s in (lineup.get("slots") or [])]
    problems: list[str] = []

    if len(ids) != len(expected):
        problems.append(f"roster has {len(ids)} players, needs {len(expected)}")
    if len(slots) != len(ids):
        problems.append(f"{len(slots)} slots for {len(ids)} players")

    rows: list[tuple[str, dict]] = []
    for k, dk in enumerate(ids):
        row = slate.get(dk)
        if row is None:
            problems.append(f"DK id {dk!r} is not on this slate")
            continue
        slot = slots[k] if k < len(slots) else expected[k] if k < len(expected) else ""
        rows.append((slot, row))

    if len(ids) == len(expected) and slots != expected:
        problems.append(f"slots {slots} do not match {expected}")

    for slot, row in rows:
        pos = str(row.get("position") or "").upper()
        rp = str(row.get("roster_position") or "").upper()
        if showdown:
            if slot == "CPT" and rp != "CPT":
                problems.append(f"CPT slot holds {row.get('name')} from a {rp or 'non-CPT'} row")
            elif slot == "FLEX" and rp == "CPT":
                problems.append(f"FLEX slot holds {row.get('name')} from a CPT row")
        elif slot == "FLEX":
            if pos not in FLEX_POSITIONS:
                problems.append(f"FLEX slot holds {pos} {row.get('name')}")
        elif slot and pos != slot:
            problems.append(f"{slot} slot holds {pos} {row.get('name')}")

    if len(set(ids)) != len(ids):
        problems.append("duplicate DK id in lineup")
    people = [_person(r) for _, r in rows]
    if len(set(people)) != len(people):
        problems.append("duplicate player in lineup")

    salary = 0
    for _, row in rows:
        if row.get("salary") is None:
            problems.append(f"no salary on slate for {row.get('name')}")
        else:
            salary += int(row["salary"])
    if salary > SALARY_CAP:
        problems.append(f"salary {salary} exceeds cap {SALARY_CAP}")
    reported = lineup.get("salary_used", lineup.get("salary"))
    if reported is not None and rows and len(rows) == len(ids) and int(reported) != salary:
        problems.append(f"reported salary {int(reported)} != recomputed {salary}")

    if showdown:
        teams = {str(r.get("team") or "").upper() for _, r in rows}
        if rows and len(teams) < SHOWDOWN_MIN_TEAMS:
            problems.append(f"lineup spans {len(teams)} team, needs {SHOWDOWN_MIN_TEAMS}")
    else:
        games = set()
        for _, row in rows:
            pair = parse_game_info(row.get("game_info"))
            if pair is None:
                problems.append(f"no game_info on slate for {row.get('name')}")
            else:
                games.add(pair)
        if rows and len(games) < CLASSIC_MIN_GAMES:
            problems.append(f"lineup spans {len(games)} game, needs {CLASSIC_MIN_GAMES}")
    return problems


def validate_lineups(
    lineups: list[dict], slate_rows: list[dict], slate_type: str = "classic",
) -> list[tuple[int, list[str]]]:
    """(1-based lineup number, problems) for every failing lineup."""
    index = slate_index(slate_rows)
    out = []
    for k, lu in enumerate(lineups, 1):
        problems = validate_lineup(lu, index, slate_type)
        if problems:
            out.append((k, problems))
    return out


def assert_valid(lineups: list[dict], slate_rows: list[dict], slate_type: str = "classic") -> None:
    """Raise naming every failing lineup and rule. Nothing downstream runs on a failure."""
    failures = validate_lineups(lineups, slate_rows, slate_type)
    if not failures:
        return
    lines = [f"lineup {k}: " + "; ".join(p) for k, p in failures]
    raise RuntimeError(
        f"{len(failures)} of {len(lineups)} lineups break DK rules:\n  " + "\n  ".join(lines)
    )


def read_upload(path: Path | str) -> list[dict]:
    """A dk_upload_*.csv (line 1 is the site header) as lineup dicts. No salary column."""
    p = Path(path)
    with p.open(newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if not header:
            return []
        slots = [h.strip().upper() for h in header]
        out = []
        for cells in reader:
            if not any(c.strip() for c in cells):
                continue
            names, ids = [], []
            for c in cells[: len(slots)]:
                m = _CELL_ID.match(c.strip())
                names.append(m.group("name").strip() if m else c.strip())
                ids.append(m.group("id").strip() if m else "")
            out.append({"slots": list(slots), "names": names, "dk_ids": ids, "salary_used": None})
    return out
