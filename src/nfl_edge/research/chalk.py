"""Repeat-chalk tag: players the field keeps piling on who keep not paying.

Six weeks of 2026 Main-slate contests showed no bucket signal (position × salary, ownership band:
chalk busts at the same ~50% rate as 5-15% owned players). The signal is per player: Bijan,
Jeanty, Chase, St. Brown were chalk two or three times and busted each time; Gibbs, Walker, Lamb
were chalk as often and paid every time. So the tag reads a player's own chalk history.

Numeric, deterministic, zero Jev calls. It sits next to the Jev verdict in the audit output and
never changes it: KEEP means he plays his role; CHALK means the crowd is ahead of his production.

Chalk week:  field ownership >= CHALK_OWN in that week's largest Main contest.
Bust:        DK points per $1k salary < BUST_PTS_PER_K.
Tag:         projected field ownership (model.dfs_exposure.own_field_sim, newest run) >= CHALK_OWN
             and busted in >= MIN_BUSTS of his prior chalk weeks this season.
As-of:       history for week W reads only weeks < W of the same season.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..db import read_sql

CHALK_OWN = 0.15
BUST_PTS_PER_K = 2.5
MIN_BUSTS = 2


@dataclass(frozen=True)
class ChalkRow:
    week: int
    player_id: str
    name: str
    position: str
    salary: int
    own: float
    fpts: float | None

    @property
    def pts_per_k(self) -> float | None:
        return None if self.fpts is None or self.salary <= 0 else self.fpts / (self.salary / 1000)

    @property
    def bust(self) -> bool | None:
        p = self.pts_per_k
        return None if p is None else p < BUST_PTS_PER_K


def contest_rows(season: int, site: str = "dk") -> list[ChalkRow]:
    """One row per (week, player) from the largest loaded Main contest of each week."""
    df = read_sql(
        """
        with contests as (
          select distinct on (c.slate_id) c.contest_key, c.slate_id
          from raw.dk_contests c
          where c.slate_id like %s
          order by c.slate_id, c.entries desc
        )
        select split_part(c.slate_id, '_', 2)::int as week, s.player_id, pt.player_name,
               s.position, s.salary, pt.own::float8 as own, pt.fpts::float8 as fpts
        from contests c
        join raw.dk_contest_player_totals pt using (contest_key)
        join lateral (
          select player_id, position, salary from raw.dk_salaries s
          where s.site = %s and s.slate_id = c.slate_id
            and lower(btrim(s.name)) = lower(btrim(pt.player_name))
            and s.roster_position <> 'FLEX' and s.player_id is not null and s.salary is not null
          limit 1
        ) s on true
        order by 1, pt.own desc
        """,
        (f"{season}\\_%\\_main", site),
    )
    return [ChalkRow(int(r["week"]), str(r["player_id"]), str(r["player_name"]), str(r["position"]),
                     int(r["salary"]), float(r["own"]), None if r["fpts"] is None else float(r["fpts"]))
            for r in df.to_dicts()]


@dataclass(frozen=True)
class ChalkHistory:
    player_id: str
    name: str
    chalk_weeks: tuple[int, ...]
    busts: int
    pts_per_k: tuple[float, ...]


def history_before(rows: list[ChalkRow], week: int) -> dict[str, ChalkHistory]:
    """Per player: the weeks before `week` in which he was chalk, and how many of them he busted."""
    by_pid: dict[str, list[ChalkRow]] = {}
    for r in rows:
        if r.week < week and r.own >= CHALK_OWN and r.pts_per_k is not None:
            by_pid.setdefault(r.player_id, []).append(r)
    out: dict[str, ChalkHistory] = {}
    for pid, rs in by_pid.items():
        rs.sort(key=lambda r: r.week)
        out[pid] = ChalkHistory(
            player_id=pid, name=rs[-1].name,
            chalk_weeks=tuple(r.week for r in rs),
            busts=sum(1 for r in rs if r.bust),
            pts_per_k=tuple(round(r.pts_per_k or 0.0, 2) for r in rs),
        )
    return out


def chalk_reason(own_proj: float | None, hist: ChalkHistory | None) -> str | None:
    """Tag text, or None. Pure."""
    if own_proj is None or own_proj < CHALK_OWN or hist is None or hist.busts < MIN_BUSTS:
        return None
    weeks = ",".join(str(w) for w in hist.chalk_weeks)
    ppk = "/".join(f"{p:.1f}" for p in hist.pts_per_k)
    return (f"CHALK field {own_proj * 100:.0f}%: busted {hist.busts} of {len(hist.chalk_weeks)} "
            f"chalk weeks (wk {weeks}: {ppk} pts/$k)")


def projected_ownership(season: int, week: int, slate: str = "main", site: str = "dk") -> dict[str, float]:
    """own_field_sim from the newest run that has exposure rows for the slate. Empty when none."""
    df = read_sql(
        """
        select e.player_id, e.own_field_sim::float8 as own
        from model.dfs_exposure e
        join model.sim_runs r using (run_id)
        where e.site = %s and e.slate_id = %s and e.own_field_sim is not null
          and r.created_at = (
            select max(r2.created_at) from model.dfs_exposure e2 join model.sim_runs r2 using (run_id)
            where e2.site = %s and e2.slate_id = %s and e2.own_field_sim is not null)
        """,
        (site, f"{season}_{week:02d}_{slate}", site, f"{season}_{week:02d}_{slate}"),
    )
    return {str(r["player_id"]): float(r["own"]) for r in df.to_dicts()}


def tags(season: int, week: int, slate: str = "main", site: str = "dk") -> dict[str, Any]:
    """{'reasons': {player_id: text}, 'projected': n, 'history_weeks': [...]} for the audit."""
    rows = contest_rows(season, site)
    hist = history_before(rows, week)
    proj = projected_ownership(season, week, slate, site)
    reasons = {pid: r for pid, own in proj.items() if (r := chalk_reason(own, hist.get(pid)))}
    return {
        "reasons": reasons,
        "names": {pid: hist[pid].name for pid in reasons},
        "projected": len(proj),
        "history_weeks": sorted({r.week for r in rows if r.week < week}),
    }


def grade(season: int, week: int, slate: str = "main", site: str = "dk") -> dict[str, Any]:
    """What week W's tags (history < W, W's projected ownership) did against W's contest results."""
    rows = contest_rows(season, site)
    hist = history_before(rows, week)
    proj = projected_ownership(season, week, slate, site)
    actual = {r.player_id: r for r in rows if r.week == week}
    tagged, untagged = [], []
    for pid, own in proj.items():
        a = actual.get(pid)
        if a is None or a.pts_per_k is None or a.own < CHALK_OWN:
            continue
        rec = {"player_id": pid, "name": a.name, "position": a.position, "salary": a.salary,
               "own_proj": own, "own_actual": a.own, "pts_per_k": round(a.pts_per_k, 2), "bust": a.bust}
        (tagged if chalk_reason(own, hist.get(pid)) else untagged).append(rec)
    rate = lambda xs: (sum(1 for x in xs if x["bust"]) / len(xs)) if xs else None
    return {"week": week, "tagged": sorted(tagged, key=lambda x: x["pts_per_k"]),
            "untagged_chalk": len(untagged), "tagged_bust_rate": rate(tagged),
            "untagged_bust_rate": rate(untagged), "has_contest": bool(actual)}


__all__ = [
    "BUST_PTS_PER_K", "CHALK_OWN", "MIN_BUSTS", "ChalkHistory", "ChalkRow", "chalk_reason",
    "contest_rows", "grade", "history_before", "projected_ownership", "tags",
]
