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


CLASSIC_EXPOSURE_HEADER = [
    "Player", "Position", "Team", "Salary", "Fpts", "Win%", "Top1%",
    "Sim. Own%", "Proj. Own%", "Avg. Return",
]
CLASSIC_EXPOSURE_WIDTH = 10
SHOWDOWN_EXPOSURE_HEADER = [
    "Player", "Roster Position", "Position", "Team", "Win%", "Top10%",
    "Sim. Own%", "Proj. Own%", "Avg. Return",
]
SHOWDOWN_EXPOSURE_WIDTH = 9


class ExposureSchemaError(ValueError):
    """NFL-DFS-Tools exposure header or row width does not match the contract."""


def _header_key(header: list[str]) -> tuple[str, ...]:
    return tuple(h.strip() for h in header)


def _exposure_contract(header: list[str]) -> tuple[str, int]:
    key = _header_key(header)
    if key == tuple(CLASSIC_EXPOSURE_HEADER):
        return "classic", CLASSIC_EXPOSURE_WIDTH
    if key == tuple(SHOWDOWN_EXPOSURE_HEADER):
        return "showdown", SHOWDOWN_EXPOSURE_WIDTH
    raise ExposureSchemaError(
        f"unknown exposure header ({len(header)} fields): {list(key)}"
    )


def _money(raw: object) -> float | None:
    if raw is None or str(raw).strip() == "":
        return None
    s = str(raw).strip().replace("$", "").replace(",", "")
    try:
        return float(s)
    except ValueError:
        return None


def parse_exposure_csv(path: Path, slate: list[dict]) -> list[dict]:
    by_name = {str(r.get("name") or "").strip().lower(): r for r in slate if r.get("name")}
    out = []
    with path.open(newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if not header:
            return []
        kind, width = _exposure_contract(header)
        n_header = len(header)
        for cells in reader:
            if len(cells) != width:
                raise ExposureSchemaError(
                    f"exposure header has {n_header} fields, data row has {len(cells)} "
                    f"(contract {kind} width {width})"
                )
            name = (cells[0] or "").strip()
            src = by_name.get(name.lower())
            if not src or not src.get("player_id"):
                continue
            if kind == "classic":
                # Writer cells: name,pos,team,$salary,fpts,win%,top1%,sim%,proj%,$return.
                # own_field_proj always comes from projections.csv (merge_exposure),
                # never from this file's Proj. Own% column.
                win = _pct(cells[5])
                field_sim = _pct(cells[7])
                field_proj = None
                roi = _money(cells[9])
            else:
                win = _pct(cells[4])
                field_sim = _pct(cells[6])
                field_proj = _pct(cells[7])
                roi = _money(cells[8])
            out.append({
                "player_id": src["player_id"],
                "own_field_sim": field_sim,
                "own_field_proj": field_proj,
                "win_pct": win,
                "roi": roi,
            })
    return _collapse_exposure(out)


def field_proj_from_projections(path: Path, slate: list[dict]) -> dict[str, float]:
    """Own% we fed the GPP sim, as a fraction, keyed by player_id."""
    by_name = {str(r.get("name") or "").strip().lower(): r["player_id"]
               for r in slate if r.get("name") and r.get("player_id")}
    out: dict[str, float] = {}
    if not path.exists():
        return out
    with path.open(newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = (row.get("Name") or "").strip()
            pid = by_name.get(name.lower())
            if not pid:
                continue
            own = _pct(row.get("Own%"))
            if own is not None:
                out[pid] = own
    return out


SELF_FIELD_TOL = 0.001


def field_is_self(exposure: list[dict], tol: float = SELF_FIELD_TOL) -> bool:
    """True when the sim's field is our own lineups.

    Judges only players we rostered (own_ours > 0): in a self-played sim the
    Sim. Own% column rounds to our exposure on nearly every such row, while a
    generated field never reproduces our exposures at 0.1pp on 9 of 10
    rostered players. No rostered rows means nothing to judge: not self.
    """
    judged = [
        r for r in exposure
        if (r.get("own_ours") or 0.0) > 0 and r.get("own_field_sim") is not None
    ]
    if not judged:
        return False
    hits = sum(
        1 for r in judged
        if abs(float(r["own_field_sim"]) - float(r["own_ours"])) <= tol
    )
    return hits / len(judged) > 0.9


def merge_exposure(
    parsed: list[dict],
    ours: dict[str, float],
    field_proj: dict[str, float],
) -> list[dict]:
    """own_ours from our lineups, own_field_proj from projections, own_field_sim from the CSV."""
    out = []
    for row in parsed:
        pid = row["player_id"]
        own_ours = ours.get(pid, 0.0)
        proj = field_proj.get(pid)
        if proj is None:
            proj = row.get("own_field_proj")
        sim = row.get("own_field_sim")
        lev = None if sim is None else own_ours - sim
        out.append({
            **row,
            "own_ours": own_ours,
            "own_field_proj": proj,
            "own_field_sim": sim,
            "leverage": lev,
        })
    return out


def exposure_from_lineups(lineups: list[dict], slate: list[dict]) -> dict[str, float]:
    """Share of our lineups that contain each player_id. Count once per lineup."""
    by_dk = {}
    for r in slate:
        did = str(r.get("player_dk_id") or "")
        pid = r.get("player_id")
        if did and pid:
            by_dk[did] = pid
    n = len(lineups)
    if n == 0:
        return {}
    counts: dict[str, int] = {}
    for lu in lineups:
        seen: set[str] = set()
        for did in lu.get("dk_ids") or []:
            pid = by_dk.get(str(did))
            if pid and pid not in seen:
                seen.add(pid)
                counts[pid] = counts.get(pid, 0) + 1
    return {pid: c / n for pid, c in counts.items()}


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
        if prev.get("own_field_sim") is not None or row.get("own_field_sim") is not None:
            sim = (prev.get("own_field_sim") or 0.0) + (row.get("own_field_sim") or 0.0)
        proj_vals = [
            v for v in (prev.get("own_field_proj"), row.get("own_field_proj")) if v is not None
        ]
        proj = max(proj_vals) if proj_vals else None
        win_vals = [v for v in (prev.get("win_pct"), row.get("win_pct")) if v is not None]
        roi_vals = [v for v in (prev.get("roi"), row.get("roi")) if v is not None]
        by_pid[pid] = {
            **prev,
            "own_field_sim": sim,
            "own_field_proj": proj,
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


UPLOAD_NAME = re.compile(
    r"^dk_upload_(?P<slate_id>.+)_(?P<run_id_prefix>[A-Za-z0-9-]{1,8})_"
    r"(?P<source>sim|user-optimized|single)\.csv$"
)


def upload_filename(slate_id: str, run_id: str, source: str = "sim") -> str:
    """Provenance for a DK upload: slate, first 8 of run_id, and source."""
    return f"dk_upload_{slate_id}_{run_id[:8]}_{source}.csv"


def parse_upload_stamp(path: Path | str) -> dict:
    """Read run/slate/source from the filename (and full run_id from the path)."""
    p = Path(path)
    m = UPLOAD_NAME.match(p.name)
    if not m:
        raise ValueError(f"not an nfl-edge upload filename: {p.name}")
    stamp = {
        "slate_id": m.group("slate_id"),
        "run_id_prefix": m.group("run_id_prefix"),
        "source": m.group("source"),
        "run_id": None,
    }
    # data/dfs/<run_id>/<site>/<slate>/dk_upload_….csv
    parts = p.parts
    if len(parts) >= 4:
        maybe = parts[-4]
        if maybe.startswith(stamp["run_id_prefix"]):
            stamp["run_id"] = maybe
    return stamp


def upload_csv(
    lineups: list[dict],
    run_id: str = "",
    slate_id: str = "",
    alias_ids: dict[str, str] | None = None,
) -> str:
    """DK upload of this slate's IDs. Line 1 is the DK header — no comment.

    Provenance is the filename (`upload_filename`); `run_id` / `slate_id` stay
    on the signature so callers keep passing them. `alias_ids` is ignored —
    never substitute another slate.
    """
    del alias_ids, run_id, slate_id
    sd = bool(lineups) and (lineups[0].get("slots") or [""])[0] == "CPT"
    header = "CPT,FLEX,FLEX,FLEX,FLEX,FLEX" if sd else "QB,RB,RB,WR,WR,WR,TE,FLEX,DST"
    lines = [header]
    for lu in lineups:
        cells = []
        for name, did in zip(lu["names"], lu["dk_ids"]):
            cells.append(f"{name} ({did})" if did else name)
        lines.append(",".join(cells))
    return "\n".join(lines) + "\n"


def rescore_mean_fpts(
    lineups: list[dict],
    mean_by_dk: dict[str, float],
    *,
    showdown: bool = False,
) -> list[dict]:
    """Replace the optimizer's adjusted Fpts sum with the mean projection sum."""
    out = []
    for lu in lineups:
        row = dict(lu)
        ids = row.get("dk_ids") or []
        slots = row.get("slots") or [""] * len(ids)
        total = 0.0
        for did, slot in zip(ids, slots):
            key = str(did)
            if key not in mean_by_dk:
                raise RuntimeError(
                    f"no mean projection for DraftKings id {did}; cannot re-score lineup"
                )
            pts = float(mean_by_dk[key])
            if showdown and slot == "CPT":
                pts *= 1.5
            total += pts
        row["proj_fpts"] = total
        out.append(row)
    return out


def lineup_json(row: dict, settings: dict | None = None) -> dict:
    players = []
    for slot, name, did in zip(row["slots"], row["names"], row["dk_ids"]):
        players.append({"slot": slot, "name": name, "dk_id": did})
    body = {"players": players, "stack": row.get("stack")}
    if settings:
        body["settings"] = settings
    return body
