"""Rebuild 150 mass lineups per main slate under projection variants; score vs actuals and contest.

Usage: uv run python scripts/opto_projection_backtest.py 2,4,5,6,7 sim,sal50,adj50,adj25,fp 4
FantasyPros variants only run weeks with pre-kickoff FantasyPros rows (5+)."""
import csv
import json
import shutil
import sys
from pathlib import Path

import numpy as np

from nfl_edge.db import conn
from nfl_edge.dfs import run_optimizer

ROOT = Path("/tmp/optbt")  # scratch: rebuilt lineups + results.json
WEEKS = {2: ("d27aa2f1-69eb-44a0-910c-714493fdcc31", 195661349),
         4: ("14fa5f61-61aa-4694-b9d5-8c807a221547", 196169705),
         5: ("286a1313-80e2-4912-b1c0-bb87c4ef0b46", 196420173),
         6: ("48726f93-a4a0-44b6-a30f-6890b9561c42", 196672011),
         7: ("2578f504-d047-42a4-aea7-5801d9cec56d", None)}


def q(sql, p=()):
    with conn() as c:
        cur = c.cursor(); cur.execute(sql, p); return cur.fetchall()


def slate_players(week, rid):
    rows = q("""
      select distinct on (s.player_id) s.name, s.team, s.position, s.salary, s.player_id, s.player_dk_id::text,
             pp.fpts_dk_mean::float8, fp.fpts_dk::float8, sa.dk_pts::float8
      from raw.dk_salaries s
      left join model.proj_players pp on pp.run_id=%s and pp.player_id=s.player_id
      left join raw.schedules g on g.game_id=pp.game_id
      left join raw.external_players fp on fp.source='fantasypros' and fp.season=2026 and fp.week=%s
        and fp.player_id=s.player_id
        and fp.ingested_at < ((g.gameday||' '||g.gametime)::timestamp at time zone 'America/New_York')
      left join model.slate_actuals sa on sa.season=2026 and sa.week=%s and sa.player_id=s.player_id
      where s.site='dk' and s.slate_id=%s and s.player_id is not null
      order by s.player_id, (s.roster_position='FLEX')""", (rid, week, week, f"2026_{week:02d}_main"))
    return [dict(zip(["name", "team", "pos", "salary", "pid", "dk", "sim", "fp", "act"], r)) for r in rows]


def salary_prior(week):
    """Per-position OLS of actual DK pts on salary, main slates weeks < W (as-of)."""
    rows = q("""
      select s.position, s.salary::float8, sa.dk_pts::float8
      from raw.dk_salaries s join model.slate_actuals sa
        on sa.season=2026 and sa.week=substr(s.slate_id,6,2)::int and sa.player_id=s.player_id
      where s.site='dk' and s.slate_id ~ '^2026_0[0-9]_main$' and substr(s.slate_id,6,2)::int < %s
        and s.roster_position <> 'CPT' and sa.dk_pts is not null""", (week,))
    fit = {}
    for pos in {r[0] for r in rows}:
        x = np.array([r[1] for r in rows if r[0] == pos]); y = np.array([r[2] for r in rows if r[0] == pos])
        b, a = np.polyfit(x, y, 1); fit[pos] = (a, b)
    return fit


def variant_mean(v, p, prior):
    sim, fp = p["sim"], p["fp"]
    if v == "sim":
        return sim
    if v == "sal50":
        a, b = prior.get(p["pos"], (None, None))
        return None if sim is None or a is None else 0.5 * sim + 0.5 * (a + b * p["salary"])
    if p["pos"] == "DST":
        return sim
    if sim is None or fp is None:
        return None
    w = {"adj50": 0.5, "adj25": 0.25, "fp": 0.0}[v]
    return w * sim + (1 - w) * fp


def build(week, v, rep):
    rid, _ = WEEKS[week]
    src = Path(f"data/dfs/{rid}/dk/main")
    out = ROOT / f"w{week}" / f"{v}_{rep}"
    if (out / "optimal_lineups.csv").exists():
        return out
    out.mkdir(parents=True, exist_ok=True)
    for f in ("projections.csv", "player_ids.csv", "contest_structure.csv", "config.json"):
        shutil.copy2(src / f, out / f)
    players = {(p["name"], p["team"]): p for p in slate_players(week, rid)}
    prior = salary_prior(week)
    with (src / "projections.csv").open() as f:
        rows = list(csv.DictReader(f))
    kept = []
    for r in rows:
        p = players.get((r["Name"], r["Team"]))
        if p is None or p["sim"] is None:
            kept.append(r); continue
        m = variant_mean(v, p, prior)
        if m is None:
            continue
        r["Fpts"] = f"{float(r['Fpts']) - p['sim'] + m:.4f}"
        kept.append(r)
    with (out / "projections.csv").open("w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys())); w.writeheader(); w.writerows(kept)
    run_optimizer.run(out, site="dk", lineups=150)
    return out


def score(week, out):
    from nfl_edge.dfs.parse import parse_opto_csv
    rid, ck = WEEKS[week]
    by_dk = {p["dk"]: p for p in slate_players(week, rid)}
    lus = parse_opto_csv(out / "optimal_lineups.csv")
    pts, proj = [], []
    for lu in lus:
        ps = [by_dk[d] for d in lu["dk_ids"]]
        pts.append(sum((p["act"] or 0.0) for p in ps)); proj.append(sum((p["sim"] or 0.0) for p in ps))
    pts = np.array(pts); res = {"n": len(pts), "mean": pts.mean(), "p90": np.percentile(pts, 90),
                                "max": pts.max(), "simproj": float(np.mean(proj))}
    if ck:
        meta = q("select entries, top1_score::float8, cash_score::float8, source from raw.dk_contests where contest_key=%s", (ck,))[0]
        _entries, top1, cash, srcname = meta
        res["top1"] = None if top1 is None else int((pts >= top1).sum())
        res["cash"] = None if cash is None else int((pts >= cash).sum())
        if srcname == "standings":
            field = np.sort(np.array([r[0] for r in q("select points::float8 from raw.dk_contest_entries where contest_key=%s", (ck,))]))
            better = len(field) - np.searchsorted(field, pts, side="right")
            res["pct"] = float(np.mean(better / len(field)) * 100)
            res["best_pct"] = float(np.min(better / len(field)) * 100)
    return res


if __name__ == "__main__":
    weeks = [int(w) for w in sys.argv[1].split(",")]
    variants = sys.argv[2].split(",")
    reps = int(sys.argv[3]) if len(sys.argv) > 3 else 1
    results = json.loads((ROOT / "results.json").read_text()) if (ROOT / "results.json").exists() else {}
    for wk in weeks:
        for v in variants:
            if v not in ("sim", "sal50") and wk < 5:
                continue
            for rep in range(reps):
                key = f"{wk}|{v}|{rep}"
                if key in results:
                    continue
                out = build(wk, v, rep)
                results[key] = score(wk, out)
                print(key, {k: (round(x, 2) if isinstance(x, float) else x) for k, x in results[key].items()}, flush=True)
                (ROOT / "results.json").write_text(json.dumps(results, default=float))
