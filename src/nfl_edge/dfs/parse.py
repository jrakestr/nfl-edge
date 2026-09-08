"""Parse NFL-DFS-Tools CSV output into nfl-edge rows. IDs always come from the file (the slate)."""
from __future__ import annotations

import csv
import re
from pathlib import Path

CELL_ID = re.compile(r"^(?P<name>.*)\s+\((?P<id>[^)]+)\)\s*$")
SLOTS = ["QB", "RB", "RB2", "WR", "WR2", "WR3", "TE", "FLEX", "DST"]
SHOWDOWN_SLOTS = ["CPT", "FLEX", "FLEX2", "FLEX3", "FLEX4", "FLEX5"]


def _layout(header: list[str]) -> tuple[int, int, list[str]]:
    """(name_start, n_players, slots) from the optimizer/GPP header."""
    h = [c.strip().upper() for c in header]
    if h and h[:1] == ["TYPE"] and len(h) > 1 and h[1] == "CPT":
        return 1, 6, SHOWDOWN_SLOTS
    if h and h[:1] == ["CPT"]:
        return 0, 6, SHOWDOWN_SLOTS
    return 0, 9, SLOTS


def split_cell(raw: str) -> tuple[str, str | None]:
    s = (raw or "").strip()
    m = CELL_ID.match(s)
    if m:
        return m.group("name").strip(), m.group("id").strip()
    return s, None


def _pct(raw: object) -> float | None:
    if raw is None or str(raw).strip() == "":
        return None
    s = str(raw).strip()
    had_pct = "%" in s
    t = s.replace("%", "")
    try:
        v = float(t)
    except ValueError:
        return None
    return v / 100.0 if had_pct or v > 1.0 else v


def parse_opto_csv(path: Path) -> list[dict]:
    rows = []
    with path.open(newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if not header:
            return []
        start, n, slots = _layout(header)
        sal_i = start + n
        for i, cells in enumerate(reader):
            if len(cells) < start + n:
                continue
            names, ids = [], []
            for c in cells[start:start + n]:
                nme, did = split_cell(c)
                names.append(nme)
                ids.append(did or "")
            salary = int(float(cells[sal_i])) if len(cells) > sal_i and cells[sal_i] else None
            proj = float(cells[sal_i + 1]) if len(cells) > sal_i + 1 and cells[sal_i + 1] else None
            used = float(cells[sal_i + 2]) if len(cells) > sal_i + 2 and cells[sal_i + 2] else None
            stack = cells[-1] if len(cells) > sal_i + 3 else None
            rows.append({
                "lineup_id": str(i),
                "names": names,
                "dk_ids": ids,
                "slots": slots,
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
        start, n, _slots = _layout(header)
        lower = [h.lower().strip() for h in header]
        win_i = next((i for i, h in enumerate(lower) if h in {"win %", "win%"}), None)
        roi_i = next((i for i, h in enumerate(lower) if h in {"roi%", "roi"}), None)
        for i, cells in enumerate(reader):
            if len(cells) < start + n:
                continue
            names, ids = [], []
            for c in cells[start:start + n]:
                nme, did = split_cell(c)
                names.append(nme)
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
    return _collapse_exposure(out)


def _collapse_exposure(rows: list[dict]) -> list[dict]:
    """Showdown writes CPT and FLEX rows for the same person; PK is player_id."""
    by_pid: dict[str, dict] = {}
    for row in rows:
        pid = row["player_id"]
        prev = by_pid.get(pid)
        if prev is None:
            by_pid[pid] = dict(row)
            continue
        sim = None
        if prev.get("sim_own") is not None or row.get("sim_own") is not None:
            sim = (prev.get("sim_own") or 0.0) + (row.get("sim_own") or 0.0)
        proj_vals = [v for v in (prev.get("proj_own"), row.get("proj_own")) if v is not None]
        proj = max(proj_vals) if proj_vals else None
        win_vals = [v for v in (prev.get("win_pct"), row.get("win_pct")) if v is not None]
        roi_vals = [v for v in (prev.get("roi"), row.get("roi")) if v is not None]
        lev = None if sim is None or proj is None else sim - proj
        by_pid[pid] = {
            **prev,
            "sim_own": sim,
            "proj_own": proj,
            "leverage": lev,
            "win_pct": max(win_vals) if win_vals else None,
            "roi": max(roi_vals) if roi_vals else None,
        }
    return list(by_pid.values())


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
    sd = bool(lineups) and (lineups[0].get("slots") or [""])[0] == "CPT"
    header = "CPT,FLEX,FLEX,FLEX,FLEX,FLEX" if sd else "QB,RB,RB,WR,WR,WR,TE,FLEX,DST"
    lines = [
        f"# nfl-edge run_id={run_id} slate_id={slate_id}",
        header,
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
