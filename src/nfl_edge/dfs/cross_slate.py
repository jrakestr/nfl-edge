"""Standalone DK classic optimizer for slates that span sim runs (e.g. Monday wk4 + Thursday wk5).

Self-contained: reads `raw.dk_salaries` and `model.proj_players` directly and solves its own
MILP with pulp. It does not use the NFL-DFS-Tools wrapper, the GPP field sim, or
`outputs/dfs_export`. Each game takes its projections from the run that simulated it.
No field sim, no ownership, no Postgres persistence.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import numpy as np
import pulp

from ..config import DATA_DIR
from ..ingest import names as N
from ..ingest.dk_salaries import parse_game_info

SLOTS = ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "FLEX", "DST"]
UPLOAD_HEADER = ",".join(SLOTS)
OUT_STATUSES = {"out", "ir", "doubtful"}
POSITIONS = ("QB", "RB", "WR", "TE", "DST")

Pair = tuple[str, str]


@dataclass
class Pool:
    players: list[dict] = field(default_factory=list)
    dropped: list[dict] = field(default_factory=list)      # OUT / IR / doubtful
    unmatched: list[dict] = field(default_factory=list)    # no player_id in the crosswalk
    unprojected: list[dict] = field(default_factory=list)  # matched, but no sim row


def _f(x: Any) -> float | None:
    return None if x is None else float(x)


def build_pool(
    salary_rows: list[dict],
    proj_by_pair: dict[Pair, dict[str, dict]],
    overrides_by_pair: dict[Pair, dict[str, str]],
) -> Pool:
    """Join salaries to the projections of the run that covers each row's game.

    Fails closed: a game in neither run raises; unmatched / unprojected rows are listed and
    excluded, never guessed; a player_id on the slate twice raises.
    """
    pairs: list[Pair] = []
    parsed: list[tuple[dict, Pair]] = []
    for r in salary_rows:
        pair = parse_game_info(r.get("game_info"))
        if pair is None:
            raise RuntimeError(f"unparseable game_info for {r.get('name')}: {r.get('game_info')!r}")
        parsed.append((r, pair))
        if pair not in pairs:
            pairs.append(pair)
    missing = [p for p in pairs if p not in proj_by_pair]
    if missing:
        raise RuntimeError(
            "slate games missing from the supplied runs: "
            + ", ".join(f"{a}@{h}" for a, h in missing)
        )

    pool = Pool()
    seen: set[str] = set()
    for r, pair in parsed:
        pid = r.get("player_id")
        base = {"name": r.get("name"), "team": r.get("team"), "position": r.get("position")}
        if not pid:
            pool.unmatched.append(base)
            continue
        status = (overrides_by_pair.get(pair) or {}).get(pid)
        if status and str(status).strip().lower() in OUT_STATUSES:
            pool.dropped.append({**base, "player_id": pid, "status": str(status)})
            continue
        proj = proj_by_pair[pair].get(pid)
        if proj is None or proj.get("fpts_dk_mean") is None:
            pool.unprojected.append({**base, "player_id": pid})
            continue
        if pid in seen:
            raise RuntimeError(f"player_id {pid} appears twice on the slate")
        seen.add(pid)
        team = N.TEAM_ALIASES.get(str(r["team"]).upper(), str(r["team"]).upper())
        mean = float(proj["fpts_dk_mean"])
        p90 = _f(proj.get("p90"))
        pool.players.append({
            "player_id": pid,
            "dk_id": str(r.get("player_dk_id")),
            "name": r.get("name"),
            "team": team,
            "opp": pair[1] if team == pair[0] else pair[0],
            "pos": str(r["position"]).upper(),
            "salary": int(r["salary"]),
            "mean": mean,
            "p90": mean if p90 is None else p90,
            "game": pair,
            "run_id": proj.get("run_id"),
        })
    return pool


def _solve(
    players: list[dict],
    score: list[float],
    *,
    salary_cap: int,
    banned: set[int],
    prior: list[set[int]],
    min_diff: int,
    stack: bool,
) -> list[int] | None:
    prob = pulp.LpProblem("cross", pulp.LpMaximize)
    x = [pulp.LpVariable(f"x{i}", cat="Binary") for i in range(len(players))]
    prob += pulp.lpSum(score[i] * x[i] for i in range(len(players)))

    def of(*pos: str) -> list[int]:
        return [i for i, p in enumerate(players) if p["pos"] in pos]

    prob += pulp.lpSum(x) == 9
    prob += pulp.lpSum(x[i] for i in of("QB")) == 1
    prob += pulp.lpSum(x[i] for i in of("DST")) == 1
    prob += pulp.lpSum(x[i] for i in of("RB")) >= 2
    prob += pulp.lpSum(x[i] for i in of("RB")) <= 3
    prob += pulp.lpSum(x[i] for i in of("WR")) >= 3
    prob += pulp.lpSum(x[i] for i in of("WR")) <= 4
    prob += pulp.lpSum(x[i] for i in of("TE")) >= 1
    prob += pulp.lpSum(x[i] for i in of("TE")) <= 2
    prob += pulp.lpSum(players[i]["salary"] * x[i] for i in range(len(players))) <= salary_cap

    games = sorted({p["game"] for p in players})
    y = {g: pulp.LpVariable(f"y{k}", cat="Binary") for k, g in enumerate(games)}
    for g in games:
        prob += y[g] <= pulp.lpSum(x[i] for i, p in enumerate(players) if p["game"] == g)
    prob += pulp.lpSum(y.values()) >= min(2, len(games))

    if stack:
        for q in of("QB"):
            team, opp = players[q]["team"], players[q]["opp"]
            same = [i for i, p in enumerate(players) if p["team"] == team and p["pos"] in ("WR", "TE")]
            vs = [i for i, p in enumerate(players) if p["team"] == opp and p["pos"] in ("WR", "TE", "RB")]
            prob += pulp.lpSum(x[i] for i in same) >= x[q]
            prob += pulp.lpSum(x[i] for i in vs) >= x[q]

    for i in banned:
        prob += x[i] == 0
    for chosen in prior:
        prob += pulp.lpSum(x[i] for i in chosen) <= 9 - min_diff

    prob.solve(pulp.PULP_CBC_CMD(msg=False))
    if pulp.LpStatus[prob.status] != "Optimal":
        return None
    return [i for i in range(len(players)) if (x[i].value() or 0) > 0.5]


def _lineup(players: list[dict], idx: list[int]) -> dict:
    ps = sorted((players[i] for i in idx), key=lambda p: (-p["salary"], p["player_id"]))
    by = {pos: [p for p in ps if p["pos"] == pos] for pos in POSITIONS}
    slotted = [by["QB"][0], *by["RB"][:2], *by["WR"][:3], by["TE"][0]]
    used = {p["player_id"] for p in slotted} | {by["DST"][0]["player_id"]}
    flex = next(p for p in ps if p["player_id"] not in used)
    slotted += [flex, by["DST"][0]]
    qb = by["QB"][0]
    n_same = sum(1 for p in ps if p["team"] == qb["team"] and p["pos"] in ("WR", "TE"))
    n_opp = sum(1 for p in ps if p["team"] == qb["opp"] and p["pos"] in ("WR", "TE", "RB"))
    return {
        "slots": list(SLOTS),
        "player_ids": [p["player_id"] for p in slotted],
        "names": [p["name"] for p in slotted],
        "dk_ids": [p["dk_id"] for p in slotted],
        "salary": sum(p["salary"] for p in slotted),
        "proj_fpts": sum(p["mean"] for p in slotted),
        "stack": f"{qb['team']} QB +{n_same} / opp {n_opp}",
        "games": sorted({f"{a}@{h}" for a, h in (p["game"] for p in slotted)}),
        "run_ids": sorted({str(p["run_id"]) for p in slotted if p.get("run_id")}),
    }


def optimize(
    players: list[dict],
    n_lineups: int,
    *,
    salary_cap: int = 50_000,
    min_diff: int = 3,
    max_exposure: float = 0.5,
    ceiling_weight: float = 0.1,
    jitter: float = 0.08,
    seed: int = 7,
    stack: bool = True,
) -> list[dict]:
    """Greedy sequential MILP: uniqueness via no-good cuts, exposure via banning capped players.

    Raises if fewer than `n_lineups` can be built; never returns a partial set.
    """
    if not players:
        raise RuntimeError("empty player pool")
    rng = np.random.default_rng(seed)
    cap_n = max(1, round(max_exposure * n_lineups + 1e-9))
    counts = [0] * len(players)
    prior: list[set[int]] = []
    out: list[dict] = []
    for _ in range(n_lineups):
        score = []
        for p in players:
            base = (1.0 - ceiling_weight) * p["mean"] + ceiling_weight * p["p90"]
            noise = 1.0 + (rng.normal(0.0, jitter) if jitter > 0 else 0.0)
            score.append(base * max(noise, 0.0))
        banned = {i for i, c in enumerate(counts) if c >= cap_n}
        idx = _solve(players, score, salary_cap=salary_cap, banned=banned, prior=prior,
                     min_diff=min_diff, stack=stack)
        if idx is None:
            raise RuntimeError(
                f"built {len(out)} of {n_lineups} lineups; no feasible lineup under "
                f"min_diff={min_diff}, max_exposure={max_exposure}"
            )
        for i in idx:
            counts[i] += 1
        prior.append(set(idx))
        out.append(_lineup(players, idx))
    out.sort(key=lambda lu: -lu["proj_fpts"])
    return out


def upload_csv(lineups: list[dict]) -> str:
    """DK upload of this slate's IDs. Line 1 is the site header."""
    lines = [UPLOAD_HEADER]
    for lu in lineups:
        lines.append(",".join(f"{n} ({d})" for n, d in zip(lu["names"], lu["dk_ids"])))
    return "\n".join(lines) + "\n"


def upload_filename(slate_id: str, run_id: str) -> str:
    return f"dk_upload_{slate_id}_{run_id[:8]}_cross.csv"


# ------------------------------------------------------------------ DB loader + writer

def load_pool(slate_id: str, run_ids: list[str], site: str = "dk") -> tuple[Pool, dict[Pair, dict]]:
    """Per game, projections come from the first supplied run that simulated it."""
    from ..db import read_sql

    salaries = read_sql(
        "select player_id, name, position, team, salary, game_info, player_dk_id "
        "from raw.dk_salaries where site = %s and slate_id = %s",
        (site, slate_id),
    ).to_dicts()
    if not salaries:
        raise RuntimeError(f"no raw.dk_salaries for site={site} slate_id={slate_id}")
    wanted = {p for r in salaries if (p := parse_game_info(r.get("game_info")))}

    sources: dict[Pair, dict] = {}
    for rid in run_ids:
        games = read_sql(
            "select g.game_id, s.away_team, s.home_team, s.season, s.week "
            "from model.proj_games g join raw.schedules s on s.game_id = g.game_id "
            "where g.run_id = %s",
            (rid,),
        ).to_dicts()
        for g in games:
            pair = (str(g["away_team"]), str(g["home_team"]))
            if pair in wanted and pair not in sources:
                sources[pair] = {**g, "run_id": rid}

    proj_by_pair: dict[Pair, dict[str, dict]] = {}
    overrides_by_pair: dict[Pair, dict[str, str]] = {}
    for pair, src in sources.items():
        rows = read_sql(
            "select player_id, fpts_dk_mean::float8 as fpts_dk_mean, "
            "(stat_summary -> 'fpts_ppr' ->> 'p90')::float8 as p90 "
            "from model.proj_players where run_id = %s and game_id = %s",
            (src["run_id"], src["game_id"]),
        ).to_dicts()
        proj_by_pair[pair] = {r["player_id"]: {**r, "run_id": src["run_id"]} for r in rows}
        ov = read_sql(
            "select player_id, status from raw.player_overrides "
            "where season = %s and week = %s and lower(status) in ('out', 'ir', 'doubtful')",
            (int(src["season"]), int(src["week"])),
        ).to_dicts()
        overrides_by_pair[pair] = {str(r["player_id"]): str(r["status"]) for r in ov}
    return build_pool(salaries, proj_by_pair, overrides_by_pair), sources


def write_outputs(out_dir: Path, slate_id: str, run_ids: list[str], lineups: list[dict]) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    upload = out_dir / upload_filename(slate_id, run_ids[0])
    upload.write_text(upload_csv(lineups))
    table = out_dir / "lineups.csv"
    with table.open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["rank", "salary", "proj_fpts", "stack", "games", *SLOTS])
        for k, lu in enumerate(lineups, 1):
            w.writerow([k, lu["salary"], f"{lu['proj_fpts']:.2f}", lu["stack"],
                        " ".join(lu["games"]), *lu["names"]])
    runs = out_dir / "runs.csv"
    with runs.open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["slate_id", "run_id"])
        for rid in run_ids:
            w.writerow([slate_id, rid])
    return {"upload": str(upload), "lineups": str(table), "runs": str(runs)}


def out_dir_for(slate_id: str) -> Path:
    return DATA_DIR / "dfs" / "cross" / slate_id
