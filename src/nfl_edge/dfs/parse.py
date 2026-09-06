"""Parse NFL-DFS-Tools CSV output into nfl-edge rows. IDs always come from the file (the slate)."""
from __future__ import annotations

import csv
import re
from pathlib import Path

CELL_ID = re.compile(r"^(?P<name>.*)\s+\((?P<id>[^)]+)\)\s*$")
SLOTS = ["QB", "RB", "RB2", "WR", "WR2", "WR3", "TE", "FLEX", "DST"]


def split_cell(raw: str) -> tuple[str, str | None]:
    s = (raw or "").strip()
    m = CELL_ID.match(s)
    if m:
        return m.group("name").strip(), m.group("id").strip()
    return s, None


def _pct(raw: object) -> float | None:
    if raw is None or str(raw).strip() == "":
        return None
    t = str(raw).strip().replace("%", "")
    try:
        v = float(t)
    except ValueError:
        return None
    return v / 100.0 if v > 1.0 or t.endswith("%") else v


def parse_opto_csv(path: Path) -> list[dict]:
    rows = []
    with path.open(newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if not header:
            return []
        for i, cells in enumerate(reader):
            if len(cells) < 9:
                continue
            names, ids = [], []
            for c in cells[:9]:
                n, did = split_cell(c)
                names.append(n)
                ids.append(did or "")
            salary = int(float(cells[9])) if len(cells) > 9 and cells[9] else None
            proj = float(cells[10]) if len(cells) > 10 and cells[10] else None
            used = float(cells[11]) if len(cells) > 11 and cells[11] else None
            stack = cells[16] if len(cells) > 16 else None
            rows.append({
                "lineup_id": str(i),
                "names": names,
                "dk_ids": ids,
                "slots": SLOTS,
                "salary_used": salary,
                "proj_fpts": proj,
                "fpts_used": used,
                "stack": stack or None,
                "win_pct": None,
                "roi": None,
            })
    return rows


def parse_gpp_csv(path: Path) -> list[dict]:
    rows = []
    with path.open(newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if not header:
            return []
        lower = [h.lower().strip() for h in header]
        win_i = next((i for i, h in enumerate(lower) if h in {"win %", "win%"}), None)
        roi_i = next((i for i, h in enumerate(lower) if h in {"roi%", "roi"}), None)
        for i, cells in enumerate(reader):
            if len(cells) < 9:
                continue
            names, ids = [], []
            for c in cells[:9]:
                n, did = split_cell(c)
                names.append(n)
                ids.append(did or "")
            win = _pct(cells[win_i]) if win_i is not None and win_i < len(cells) else None
            roi = _pct(cells[roi_i]) if roi_i is not None and roi_i < len(cells) else None
            rows.append({
                "lineup_id": str(i), "names": names, "dk_ids": ids, "win_pct": win, "roi": roi,
            })
    return rows


def parse_exposure_csv(path: Path, slate: list[dict]) -> list[dict]:
    by_name = {str(r.get("name") or "").strip().lower(): r for r in slate if r.get("name")}
    out = []
    with path.open(newline="") as f:
        reader = csv.DictReader(f)
        fields = {k.lower().strip(): k for k in (reader.fieldnames or [])}

        def col(*names: str) -> str | None:
            for n in names:
                if n in fields:
                    return fields[n]
            return None

        for row in reader:
            name = (row.get(col("player") or "Player") or "").strip()
            src = by_name.get(name.lower())
            if not src or not src.get("player_id"):
                continue
            sim = _pct(row.get(col("sim. own%", "sim own%") or ""))
            proj = _pct(row.get(col("proj. own%", "proj own%") or ""))
            lev = None if sim is None or proj is None else sim - proj
            out.append({
                "player_id": src["player_id"],
                "sim_own": sim,
                "proj_own": proj,
                "leverage": lev,
                "win_pct": _pct(row.get(col("win%") or "")),
                "roi": _pct(row.get(col("avg. return", "roi") or "")),
            })
    return out


def merge_sim_stats(opto: list[dict], gpp: list[dict]) -> list[dict]:
    """Attach win%/ROI from the GPP file onto optimizer lineups.

    Key by this slate's DK IDs when present; fall back to casefolded names.
    """
    def key(row: dict) -> tuple:
        ids = row.get("dk_ids") or []
        if ids and all(ids):
            return ("id", tuple(sorted(ids)))
        return ("name", tuple(sorted(n.casefold() for n in row["names"])))

    by_key = {key(r): r for r in gpp}
    out = []
    for row in opto:
        hit = by_key.get(key(row))
        merged = dict(row)
        if hit:
            merged["win_pct"] = hit.get("win_pct")
            merged["roi"] = hit.get("roi")
        out.append(merged)
    return out


def upload_csv(
    lineups: list[dict],
    run_id: str,
    slate_id: str,
    alias_ids: dict[str, str] | None = None,
) -> str:
    """DK upload of this slate's IDs. `alias_ids` is ignored — never substitute another slate."""
    del alias_ids
    lines = [
        f"# nfl-edge run_id={run_id} slate_id={slate_id}",
        "QB,RB,RB,WR,WR,WR,TE,FLEX,DST",
    ]
    for lu in lineups:
        cells = []
        for name, did in zip(lu["names"], lu["dk_ids"]):
            cells.append(f"{name} ({did})" if did else name)
        lines.append(",".join(cells))
    return "\n".join(lines) + "\n"


def lineup_json(row: dict) -> dict:
    players = []
    for slot, name, did in zip(row["slots"], row["names"], row["dk_ids"]):
        players.append({"slot": slot, "name": name, "dk_id": did})
    return {"players": players, "stack": row.get("stack")}
