"""What changed since the newest complete sim of a week. Writes ops.change_checks; never sims.

Re-sim reasons: an availability override for the week whose status changed after the sim
(raw.player_overrides.updated_at only moves on a status change), and an ESPN league injury status
that differs from the last snapshot at or before the sim. A change touching out / doubtful / IR /
suspension affects the sim (those players get no usage); questionable is listed only. Market line
moves are info: market lines never enter the sim, the Lines phase reprices them.
"""
from __future__ import annotations

import json
from datetime import datetime

SIM_STATUSES = {"out", "doubtful", "ir", "injury_reserve", "suspension"}
SOURCES = (("dk ", "dk"), ("fp ", "fantasypros"), ("rts", "rts"))


def affects_sim(status: str | None) -> bool:
    return (status or "").strip().lower() in SIM_STATUSES


def source_of(note: str | None) -> str:
    text = (note or "").strip().lower()
    for prefix, name in SOURCES:
        if text.startswith(prefix):
            return name
    return "manual"


def _iso(ts: datetime) -> str:
    return ts.isoformat()


def override_reasons(rows: list[dict], sim_at: datetime) -> list[dict]:
    out = []
    for r in rows:
        if r.get("updated_at") is None or r["updated_at"] <= sim_at:
            continue
        out.append({"player": r["player"], "team": r.get("team"), "source": source_of(r.get("note")),
                    "before": None, "after": r.get("status"), "at": _iso(r["updated_at"]),
                    "affects_sim": affects_sim(r.get("status"))})
    return sorted(out, key=lambda x: (not x["affects_sim"], x["at"], x["player"]))


def espn_reasons(snaps: list[dict], sim_at: datetime) -> list[dict]:
    """Per player: last status at or before the sim vs the newest status after it."""
    before: dict[str, dict] = {}
    after: dict[str, dict] = {}
    for s in snaps:
        side = before if s["pulled_at"] <= sim_at else after
        prev = side.get(s["player"])
        if prev is None or s["pulled_at"] > prev["pulled_at"]:
            side[s["player"]] = s
    out = []
    for player, new in after.items():
        old = before.get(player)
        if old is None or (old.get("status") or "") == (new.get("status") or ""):
            continue
        out.append({"player": player, "team": new.get("nfl_team"), "source": "espn",
                    "before": old.get("status"), "after": new.get("status"),
                    "at": _iso(new["pulled_at"]),
                    "affects_sim": affects_sim(old.get("status")) or affects_sim(new.get("status"))})
    return sorted(out, key=lambda x: (not x["affects_sim"], x["at"], x["player"]))


def line_moves(games: list[dict], tol: float = 0.25) -> list[dict]:
    out = []
    for g in games:
        moved: dict = {"game_id": g["game_id"]}
        for key, sim_key, now_key in (("spread", "sim_spread", "spread_line"),
                                      ("total", "sim_total", "total_line")):
            a, b = g.get(sim_key), g.get(now_key)
            if a is not None and b is not None and abs(float(a) - float(b)) > tol:
                moved[key] = [float(a), float(b)]
        if len(moved) > 1:
            out.append(moved)
    return out


def summarize(sim: dict | None, overrides: list[dict], espn: list[dict],
              lines: list[dict]) -> dict:
    if sim is None:
        return {"sim_run_id": None, "sim_created_at": None, "suggest_resim": True,
                "reasons": [{"player": None, "team": None, "source": "no-sim", "before": None,
                             "after": None, "at": None, "affects_sim": True}],
                "info": lines}
    reasons = overrides + espn
    return {"sim_run_id": sim["run_id"], "sim_created_at": sim["created_at"],
            "suggest_resim": any(r["affects_sim"] for r in reasons),
            "reasons": reasons, "info": lines}


# --- database -----------------------------------------------------------------------------


def newest_complete_sim(season: int, week: int) -> dict | None:
    from .db import read_sql

    df = read_sql(
        """
        with slate as (
          select count(*) as n from raw.schedules
          where season = %(s)s and week = %(w)s and game_type = 'REG'
        )
        select r.run_id::text as run_id, r.created_at
        from model.sim_runs r, slate
        where r.season = %(s)s and r.week = %(w)s
          and (select count(*) from model.proj_games p where p.run_id = r.run_id) = slate.n
        order by r.created_at desc limit 1
        """,
        {"s": season, "w": week},
    )
    return None if df.is_empty() else df.to_dicts()[0]


def load_overrides(season: int, week: int) -> list[dict]:
    from .db import read_sql

    return read_sql(
        "select coalesce(p.display_name, o.player_id) as player, p.latest_team as team, "
        "o.status, o.note, o.updated_at "
        "from raw.player_overrides o left join raw.players p on p.gsis_id = o.player_id "
        "where o.season = %s and o.week = %s",
        (season, week),
    ).to_dicts()


def load_espn(season: int, since: datetime) -> list[dict]:
    from .db import read_sql

    return read_sql(
        "select player, nfl_team, status, pulled_at from fantasy.loc_status_snapshots "
        "where season = %s and pulled_at >= %s",
        (season, since),
    ).to_dicts()


def load_lines(run_id: str) -> list[dict]:
    from .db import read_sql

    return read_sql(
        "select p.game_id, p.market_spread::float8 as sim_spread, "
        "p.market_total::float8 as sim_total, m.spread_line::float8 as spread_line, "
        "m.total_line::float8 as total_line "
        "from model.proj_games p join model.market_lines_latest m on m.game_id = p.game_id "
        "where p.run_id = %s",
        (run_id,),
    ).to_dicts()


def run(season: int, week: int) -> dict:
    from datetime import timedelta

    from .db import read_sql

    sim = newest_complete_sim(season, week)
    if sim is None:
        result = summarize(None, [], [], [])
    else:
        at = sim["created_at"]
        result = summarize(
            sim,
            override_reasons(load_overrides(season, week), at),
            espn_reasons(load_espn(season, at - timedelta(days=7)), at),
            line_moves(load_lines(sim["run_id"])),
        )
    read_sql(
        "insert into ops.change_checks "
        "(season, week, sim_run_id, sim_created_at, suggest_resim, reasons, info) "
        "values (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb) returning id",
        (season, week, result["sim_run_id"], result["sim_created_at"], result["suggest_resim"],
         json.dumps(result["reasons"]), json.dumps(result["info"])),
    )
    return result
