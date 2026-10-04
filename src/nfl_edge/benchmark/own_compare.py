"""Compare our projected ownership to an RTS Own column. Comparison only.

Read-only: nothing here writes a table or a file, and nothing in sim/ or the dfs
run imports this module. RTS ownership is never an input to the field sim.
Names go through ingest.names.match_one on both sides; unmatched rows are listed,
never guessed. Players only on our side are counted, not scored as RTS zero.
"""
from __future__ import annotations

import csv
from pathlib import Path

import numpy as np
import polars as pl

from ..config import ROOT
from ..ingest import names as N


def parse_rts_own(path: Path) -> list[dict]:
    """Rows with a non-blank Own value: player, team, position, own (percent)."""
    with Path(path).open(newline="") as f:
        reader = csv.DictReader(f)
        cols = {c.strip().lower(): c for c in (reader.fieldnames or [])}
        for want in ("player", "team", "position", "own"):
            if want not in cols:
                raise ValueError(f"RTS ownership CSV needs a {want!r} column (Own)")
        out = []
        for row in reader:
            raw = (row.get(cols["own"]) or "").strip()
            player = (row.get(cols["player"]) or "").strip()
            if not raw or not player:
                continue
            try:
                own = float(raw)
            except ValueError:
                continue
            out.append({
                "player": player,
                "team": (row.get(cols["team"]) or "").strip() or None,
                "position": (row.get(cols["position"]) or "").strip() or None,
                "own": own,
            })
    return out


def read_ours(run_dir: Path) -> list[dict]:
    path = Path(run_dir) / "projections.csv"
    if not path.exists():
        raise ValueError(f"projections.csv not found: {path}")
    with path.open(newline="") as f:
        return list(csv.DictReader(f))


def find_slate_dir(run: str, slate: str, site: str = "dk") -> Path:
    base = ROOT / "data" / "dfs"
    hits = sorted(p for p in base.glob(f"{run}*") if p.is_dir())
    if not hits:
        raise ValueError(f"no data/dfs run starting with {run!r}")
    if len(hits) > 1:
        raise ValueError(f"run prefix {run!r} is ambiguous: {[h.name for h in hits]}")
    d = hits[0] / site / slate
    if not d.is_dir():
        raise ValueError(f"no slate {slate!r} for run {hits[0].name} at {d}")
    return d


def _avg_ranks(values: list[float]) -> np.ndarray:
    a = np.asarray(values, dtype=float)
    order = np.argsort(a, kind="mergesort")
    ranks = np.empty(len(a))
    i = 0
    while i < len(a):
        j = i
        while j + 1 < len(a) and a[order[j + 1]] == a[order[i]]:
            j += 1
        ranks[order[i:j + 1]] = (i + j) / 2.0
        i = j + 1
    return ranks


def spearman(a: list[float], b: list[float]) -> float | None:
    if len(a) < 3:
        return None
    ra, rb = _avg_ranks(a), _avg_ranks(b)
    if ra.std() == 0 or rb.std() == 0:
        return None
    return float(np.corrcoef(ra, rb)[0, 1])


def _match(rows: list[dict], name_key: str, own_key: str, catalog: pl.DataFrame,
           aliases: dict, teams: dict) -> tuple[dict, list[dict]]:
    by_pid: dict[str, dict] = {}
    unmatched: list[dict] = []
    for r in rows:
        name = str(r.get(name_key) or "").strip()
        m = N.match_one(
            {"player": name, "team": r.get("team") or r.get("Team"),
             "position": r.get("position") or r.get("Position")},
            catalog, aliases, teams,
        )
        try:
            own = float(r.get(own_key))
        except (TypeError, ValueError):
            continue
        rec = {
            "name": name,
            "team": r.get("team") or r.get("Team") or "",
            "position": N.normalize_pos(r.get("position") or r.get("Position")) or "",
            "own": own,
        }
        if m.player_id is None:
            unmatched.append({**rec, "reason": m.reason or "unmatched"})
        elif m.player_id not in by_pid:
            by_pid[m.player_id] = rec
    return by_pid, unmatched


def compare(rts_rows: list[dict], ours_rows: list[dict], catalog: pl.DataFrame,
            aliases: dict, teams: dict, top_n: int = 10) -> dict:
    """Pure. RTS rows carry `own`; our rows are projections.csv rows (`Own%`)."""
    cat = catalog if "_dn" in catalog.columns else N.prepare_catalog(catalog)
    rts, rts_un = _match(rts_rows, "player", "own", cat, aliases, teams)
    ours, ours_un = _match(ours_rows, "Name", "Own%", cat, aliases, teams)
    both = sorted(set(rts) & set(ours))
    pairs = [
        {"name": rts[p]["name"], "team": rts[p]["team"] or ours[p]["team"],
         "position": rts[p]["position"] or ours[p]["position"],
         "rts": rts[p]["own"], "ours": ours[p]["own"]}
        for p in both
    ]
    by_pos: dict[str, dict] = {}
    for p in pairs:
        s = by_pos.setdefault(p["position"], {"n": 0, "rts": 0.0, "ours": 0.0})
        s["n"] += 1
        s["rts"] += p["rts"]
        s["ours"] += p["ours"]
    for s in by_pos.values():
        s["rts"], s["ours"] = round(s["rts"], 1), round(s["ours"], 1)

    def top(key: str) -> list[str]:
        ranked = sorted(pairs, key=lambda x: (-x[key], x["name"]))
        return [x["name"] for x in ranked[:top_n]]

    t_rts, t_ours = top("rts"), top("ours")
    diff = sorted(pairs, key=lambda x: (x["ours"] - x["rts"], x["name"]))
    return {
        "joined": len(pairs),
        "ours_only": len(set(ours) - set(rts)),
        "rts_only": len(set(rts) - set(ours)),
        "rts_unmatched": rts_un,
        "ours_unmatched": ours_un,
        "spearman": spearman([p["rts"] for p in pairs], [p["ours"] for p in pairs]),
        "by_position": by_pos,
        "nonzero": {"rts": sum(1 for p in pairs if p["rts"] > 0),
                    "ours": sum(1 for p in pairs if p["ours"] > 0)},
        "top_n": top_n,
        "top_overlap": len(set(t_rts) & set(t_ours)),
        "top_rts": [x for x in sorted(pairs, key=lambda x: (-x["rts"], x["name"]))[:top_n]],
        "top_ours": [x for x in sorted(pairs, key=lambda x: (-x["ours"], x["name"]))[:top_n]],
        "ours_too_high": list(reversed(diff[-top_n:])),
        "ours_too_low": diff[:top_n],
    }


def format_report(r: dict) -> list[str]:
    lines = [
        (
            f"joined {r['joined']} (ours only {r['ours_only']}, RTS only {r['rts_only']}); "
            f"above 0: RTS {r['nonzero']['rts']} / ours {r['nonzero']['ours']}"
        ),
        "spearman " + ("n/a" if r["spearman"] is None else f"{r['spearman']:.3f}"),
        f"top-{r['top_n']} overlap {r['top_overlap']}",
        "by position (joined): n / RTS sum / ours sum",
    ]
    for pos in sorted(r["by_position"]):
        s = r["by_position"][pos]
        lines.append(f"  {pos:<4}{s['n']:>4} {s['rts']:>8.1f} {s['ours']:>8.1f}")

    def block(title: str, rows: list[dict]) -> None:
        lines.append(title)
        for x in rows:
            lines.append(
                f"  {x['name']:<24}{x['position']:<4}{x['team']:<4} "
                f"RTS {x['rts']:>5.1f}  ours {x['ours']:>5.1f}"
            )

    block(f"top {r['top_n']} by RTS", r["top_rts"])
    block(f"top {r['top_n']} by ours", r["top_ours"])
    block("ours too high vs RTS", r["ours_too_high"])
    block("ours too low vs RTS", r["ours_too_low"])
    for label, rows in (("RTS", r["rts_unmatched"]), ("ours", r["ours_unmatched"])):
        for u in rows:
            lines.append(f"  unmatched {label}: {u['name']} team={u['team']} ({u['reason']})")
    return lines
