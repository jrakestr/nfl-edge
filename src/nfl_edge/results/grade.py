"""Grade every model.edges / model.verdicts row of a week against scores and the close.

Pure functions (outcome, pnl, CLV, pick_close, grade_snapshot) plus `run` which loads a week's
sim runs, computes any missing edges, upserts model.results, and returns the report tables.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

import polars as pl

from ..config import ROOT, load_yaml
from ..db import read_sql, upsert
from ..market import edge as edge_mod
from ..market.edge import decimal_odds, devig_two_way
from .calibration import calibration_buckets, is_monotone

ET = ZoneInfo("America/New_York")
RESULTS_KEY = ["run_id", "market_line_id", "market_type", "side"]
DEFAULT_PRICE = -110


@dataclass
class GradeReport:
    season: int
    week: int
    run_ids: list[str]
    n_rows: int
    n_verdicts: int
    skipped_unplayed: int
    skipped_no_parquet: list[str] = field(default_factory=list)
    picks: pl.DataFrame = field(default_factory=pl.DataFrame)
    verdicts: pl.DataFrame = field(default_factory=pl.DataFrame)
    games: pl.DataFrame = field(default_factory=pl.DataFrame)
    calibration: pl.DataFrame = field(default_factory=pl.DataFrame)
    brier_sim: float | None = None
    brier_close: float | None = None
    monotone: bool | None = None


# ----------------------------------------------------------------------------- pure
def outcome(market_type: str, side: str, line: float, result: float, total: float) -> int | None:
    if market_type == "total":
        value, win_side, lose_side = float(total), "over", "under"
    else:
        value, win_side, lose_side = float(result), "home", "away"
    line = float(line)
    if value > line:
        won = win_side
    elif value < line:
        won = lose_side
    else:
        return None
    return 1 if side == won else 0


def pnl(outcome_val: int | None, price: int) -> float:
    if outcome_val is None:
        return 0.0
    if outcome_val == 1:
        return float(decimal_odds(price) - 1.0)
    return -1.0


def clv_points(market_type: str, side: str, bet_line: float, close_line: float) -> float | None:
    if market_type == "moneyline" or bet_line is None or close_line is None:
        return None
    delta = float(close_line) - float(bet_line)
    return delta if side in ("home", "over") else -delta


def closing_prob(price_a: float, price_b: float) -> float:
    return float(devig_two_way(price_a, price_b)[0])


def kickoff_at(gameday, gametime) -> datetime:
    d = gameday.date() if isinstance(gameday, datetime) else gameday
    if isinstance(d, str):
        d = date.fromisoformat(d[:10])
    if gametime in (None, ""):
        t = time(23, 59)
    else:
        hh, mm = str(gametime).split(":")[:2]
        t = time(int(hh), int(mm[:2]))
    return datetime.combine(d, t, tzinfo=ET)


def pick_close(snapshots: list[dict], kickoff: datetime, schedule: dict) -> dict | None:
    pre = []
    for s in snapshots:
        ts = s["captured_at"]
        if getattr(ts, "tzinfo", None) is None:
            ts = ts.replace(tzinfo=ET) if isinstance(ts, datetime) else ts
        if ts < kickoff:
            pre.append(s)
    if pre:
        pre.sort(key=lambda s: (s["captured_at"], s["id"]))
        s = dict(pre[-1])
        s["source"] = "snapshot"
        s["market_line_id"] = s["id"]
        return s
    if schedule.get("spread_line") is None and schedule.get("total_line") is None:
        return None
    return {
        "source": "schedules", "market_line_id": None,
        "spread_line": schedule.get("spread_line"), "total_line": schedule.get("total_line"),
        "home_spread_odds": schedule.get("home_spread_odds"),
        "away_spread_odds": schedule.get("away_spread_odds"),
        "over_odds": schedule.get("over_odds"), "under_odds": schedule.get("under_odds"),
        "home_moneyline": schedule.get("home_moneyline"),
        "away_moneyline": schedule.get("away_moneyline"),
    }


def _price(v, default: int = DEFAULT_PRICE) -> int:
    return default if v is None else int(v)


def _line_for(market_type: str, snap: dict) -> float | None:
    if market_type == "spread":
        v = snap.get("spread_line")
    elif market_type == "total":
        v = snap.get("total_line")
    else:
        return 0.0
    return None if v is None else float(v)


def _prices_for(market_type: str, snap: dict) -> tuple[int, int]:
    if market_type == "spread":
        return _price(snap.get("home_spread_odds")), _price(snap.get("away_spread_odds"))
    if market_type == "total":
        return _price(snap.get("over_odds")), _price(snap.get("under_odds"))
    return _price(snap.get("home_moneyline")), _price(snap.get("away_moneyline"))


def _require_structured(verdict: dict, game: dict) -> dict:
    payload = verdict.get("payload") if "payload" in verdict else verdict
    if isinstance(payload, str):
        payload = json.loads(payload)
    chips = payload.get("chips") or {}
    if not chips:
        return payload
    side = chips.get("side") or {}
    if not side.get("market_type") or "cover" not in (payload.get("calls") or {}):
        run_id = verdict.get("run_id", "")
        gid = verdict.get("game_id", game.get("game_id", ""))
        raise ValueError(
            f"verdict payload for run {run_id} game {gid} lacks structured chip/call fields; "
            f"run `nfl-edge lines --recompute --run {run_id}`"
        )
    return payload


def grade_snapshot(edge_rows: list[dict], bet: dict, close: dict | None,
                   game: dict, verdict: dict | None) -> list[dict]:
    payload = _require_structured(verdict, game) if verdict is not None else None
    n_snap = int(game.get("n_snapshots") or 1)
    close_id = close.get("market_line_id") if close else None
    is_last = (close_id is not None and close_id == bet["id"]) or n_snap == 1
    result, total = float(game["result"]), float(game["total"])

    pick_keys: set[tuple[str, str]] = set()
    cover_call = cover_side = None
    verd_mlid = None
    if verdict is not None and payload is not None:
        verd_mlid = verdict.get("market_line_id")
        chips = payload.get("chips") or {}
        for key in ("side", "total"):
            c = chips.get(key) or {}
            if c.get("market_type") and c.get("side"):
                pick_keys.add((c["market_type"], c["side"]))
        cover = (payload.get("calls") or {}).get("cover") or {}
        cover_call, cover_side = cover.get("call"), cover.get("side")

    rows = []
    for e in edge_rows:
        mt, side = e["market_type"], e["side"]
        line = e.get("line")
        line = float(line) if line is not None else _line_for(mt, bet)
        price = int(e["price"])
        oc = outcome(mt, side, line, result, total)
        pn = pnl(oc, price)
        kelly = float(e.get("kelly_fraction") or 0.0)

        close_src = close_mlid = close_line = close_price = closing_p = clv = clv_pts = None
        if close is not None:
            close_src = close["source"]
            close_mlid = close.get("market_line_id")
            close_line = _line_for(mt, close)
            pa, pb = _prices_for(mt, close)
            ours, other = (pa, pb) if side in ("home", "over") else (pb, pa)
            close_price = ours
            if close_line is not None:
                closing_p = closing_prob(ours, other)
                clv = closing_p - float(e["market_prob"])
                clv_pts = clv_points(mt, side, line, close_line)

        at_verdict = verd_mlid is not None and verd_mlid == bet["id"]
        rows.append({
            "market_type": mt, "side": side, "ref_id": e.get("ref_id") or game["game_id"],
            "market_line_id": bet["id"], "model_prob": float(e["model_prob"]),
            "market_prob": float(e["market_prob"]), "edge": float(e["edge"]),
            "kelly_fraction": kelly, "line": line, "price": price, "outcome": oc,
            "pnl": pn, "pnl_kelly": kelly * pn,
            "actual": total if mt == "total" else result,
            "close_source": close_src, "close_market_line_id": close_mlid,
            "close_line": close_line, "close_price": close_price,
            "closing_prob": closing_p, "clv": clv, "clv_points": clv_pts,
            "is_last_snapshot": is_last,
            "verdict_pick": at_verdict and (mt, side) in pick_keys,
            "verdict_call": cover_call if (at_verdict and mt == "spread" and side == cover_side) else None,
        })
    return rows


# ----------------------------------------------------------------------------- report tables
def _wlp(df: pl.DataFrame) -> tuple[int, int, int]:
    return (df.filter(pl.col("outcome") == 1).height,
            df.filter(pl.col("outcome") == 0).height,
            df.filter(pl.col("outcome").is_null()).height)


def _roi(df: pl.DataFrame) -> float:
    return float(df["pnl"].mean()) if df.height else float("nan")


def _kelly_roi(df: pl.DataFrame) -> float:
    stake = float(df["kelly_fraction"].sum()) if df.height else 0.0
    return float(df["pnl_kelly"].sum() / stake) if stake else 0.0


def _mean(df: pl.DataFrame, col: str) -> float:
    s = df[col].drop_nulls() if df.height else None
    return float(s.mean()) if s is not None and len(s) else float("nan")


def _pick_row(run_id: str, df: pl.DataFrame, slice_name: str) -> dict:
    w, l, p = _wlp(df)
    clv_pts = df.filter(pl.col("clv_points").is_not_null())
    return {
        "run_id": run_id, "slice": slice_name, "n": df.height,
        "w": w, "l": l, "p": p, "record": f"{w}-{l}-{p}",
        "flat_roi": _roi(df), "kelly_roi": _kelly_roi(df),
        "mean_clv_points": _mean(df, "clv_points"), "mean_clv": _mean(df, "clv"),
        "pct_clv_pos": float((clv_pts["clv_points"] > 0).mean()) if clv_pts.height else float("nan"),
    }


def _picks_table(rows: pl.DataFrame, flat: float, strong: float) -> pl.DataFrame:
    if rows.is_empty():
        return pl.DataFrame()
    f = rows.filter(pl.col("is_last_snapshot") & (pl.col("edge") > 0))
    out = []
    for (run_id,), part in f.group_by("run_id"):
        out.append(_pick_row(run_id, part, "all"))
        for (mt,), sub in part.group_by("market_type"):
            out.append(_pick_row(run_id, sub, mt))
        buckets = (
            part.filter(pl.col("edge") < flat).pipe(lambda d: (d, "<flat")),
            part.filter((pl.col("edge") >= flat) & (pl.col("edge") < strong)).pipe(lambda d: (d, "flat–strong")),
            part.filter(pl.col("edge") >= strong).pipe(lambda d: (d, "≥strong")),
        )
        for sub, name in buckets:
            if sub.height:
                out.append(_pick_row(run_id, sub, name))
    return pl.DataFrame(out) if out else pl.DataFrame()


def _verdicts_table(rows: pl.DataFrame) -> pl.DataFrame:
    if rows.is_empty():
        return pl.DataFrame()
    out = []
    for (run_id,), part in rows.group_by("run_id"):
        side = part.filter(pl.col("verdict_pick") & (pl.col("market_type") == "spread"))
        tot = part.filter(pl.col("verdict_pick") & (pl.col("market_type") == "total"))
        calls = part.filter(pl.col("verdict_call").is_in(["pays", "does not pay"])
                            & pl.col("outcome").is_not_null())
        correct = 0
        for r in calls.iter_rows(named=True):
            if ((r["verdict_call"] == "pays" and r["outcome"] == 1)
                    or (r["verdict_call"] == "does not pay" and r["outcome"] == 0)):
                correct += 1
        sw, sl, sp = _wlp(side)
        tw, tl, tp = _wlp(tot)
        n_calls = calls.height
        out.append({
            "run_id": run_id,
            "side_record": f"{sw}-{sl}-{sp}", "side_n": side.height, "side_roi": _roi(side),
            "side_clv": _mean(side, "clv_points"),
            "total_record": f"{tw}-{tl}-{tp}", "total_n": tot.height, "total_roi": _roi(tot),
            "total_clv": _mean(tot, "clv_points"),
            "cover_n": n_calls,
            "cover_acc": (correct / n_calls) if n_calls else float("nan"),
        })
    return pl.DataFrame(out) if out else pl.DataFrame()


def _games_table(rows: pl.DataFrame, meta: dict[str, dict]) -> pl.DataFrame:
    if rows.is_empty():
        return pl.DataFrame()
    last = rows.filter(pl.col("is_last_snapshot"))
    out = []
    for (run_id, gid), part in last.group_by(["run_id", "ref_id"]):
        info = meta.get((run_id, gid), {})
        sp = part.filter(pl.col("market_type") == "spread").sort("edge", descending=True)
        tot = part.filter(pl.col("market_type") == "total").sort("edge", descending=True)
        sr = sp.row(0, named=True) if sp.height else {}
        tr = tot.row(0, named=True) if tot.height else {}
        out.append({
            "run_id": run_id, "game_id": gid,
            "matchup": info.get("matchup", gid),
            "result": info.get("result"),
            "spread_side": sr.get("side"), "spread_bet": sr.get("line"),
            "spread_close": sr.get("close_line"), "spread_actual": sr.get("actual"),
            "spread_outcome": sr.get("outcome"), "spread_clv_pts": sr.get("clv_points"),
            "total_side": tr.get("side"), "total_bet": tr.get("line"),
            "total_close": tr.get("close_line"), "total_actual": tr.get("actual"),
            "total_outcome": tr.get("outcome"),
            "close_source": sr.get("close_source") or tr.get("close_source"),
        })
    return pl.DataFrame(out) if out else pl.DataFrame()


def _calibration_tables(rows: pl.DataFrame) -> tuple[pl.DataFrame, float | None, float | None, bool | None]:
    last = rows.filter(pl.col("is_last_snapshot") & pl.col("outcome").is_not_null()
                       & pl.col("model_prob").is_not_null())
    if last.is_empty():
        return pl.DataFrame(), None, None, None
    both = last.filter(pl.col("closing_prob").is_not_null())
    brier_sim = brier_close = None
    if both.height:
        y = both["outcome"].to_numpy().astype(float)
        brier_sim = float(((both["model_prob"].to_numpy() - y) ** 2).mean())
        brier_close = float(((both["closing_prob"].to_numpy() - y) ** 2).mean())
    src = last.with_columns(
        pl.col("actual").alias("result"),
        pl.lit(False).alias("push"),
        (pl.col("outcome") == 1).alias("hit"),
    )
    buckets = calibration_buckets(src, col="model_prob", hit="hit")
    return buckets, brier_sim, brier_close, is_monotone(buckets)


# ----------------------------------------------------------------------------- I/O
def _runs(season: int, week: int, run_id: str | None) -> pl.DataFrame:
    if run_id:
        return read_sql(
            "select run_id::text, season, week, draws_per_game from model.sim_runs where run_id = %s",
            (run_id,),
        )
    return read_sql(
        "select run_id::text, season, week, draws_per_game from model.sim_runs "
        "where season = %s and week = %s order by created_at",
        (season, week),
    )


def _parquet_ok(run_id: str) -> bool:
    pg = read_sql("select draws_path from model.proj_games where run_id = %s", (run_id,))
    if pg.is_empty():
        return False
    return all((ROOT / p).exists() for p in pg["draws_path"] if p)


def run(season: int, week: int, run_id: str | None = None) -> GradeReport:
    runs = _runs(season, week, run_id)
    if runs.is_empty():
        raise RuntimeError(f"no sim run for season={season} week={week} run_id={run_id}")
    cfg = load_yaml("sim.yaml")["edge"]
    skipped_pq: list[str] = []
    all_rows: list[dict] = []
    meta: dict[tuple[str, str], dict] = {}
    unplayed: set[str] = set()
    n_verdicts = 0
    kept_runs: list[str] = []

    for r in runs.iter_rows(named=True):
        rid = r["run_id"]
        if not _parquet_ok(rid):
            skipped_pq.append(rid)
            continue
        edge_mod.run(rid)
        kept_runs.append(rid)
        edges = read_sql(
            """
            select e.run_id::text, e.market_line_id, e.ref_id as game_id, e.market_type, e.side,
                   e.model_prob::float8 as model_prob, e.market_prob::float8 as market_prob,
                   e.edge::float8 as edge, e.kelly_fraction::float8 as kelly_fraction,
                   e.price, e.p_push::float8 as p_push
            from model.edges e where e.run_id = %s
            """,
            (rid,),
        )
        if edges.is_empty():
            continue
        game_ids = edges["game_id"].unique().to_list()
        snaps = read_sql(
            """
            select id, game_id, captured_at, spread_line::float8 as spread_line,
                   total_line::float8 as total_line, home_spread_odds, away_spread_odds,
                   over_odds, under_odds, home_moneyline, away_moneyline
            from raw.market_lines where game_id = any(%s) order by game_id, captured_at, id
            """,
            (game_ids,),
        )
        sched = read_sql(
            """
            select game_id, home_team, away_team, gameday, gametime,
                   result::float8 as result, total::float8 as total,
                   spread_line::float8 as spread_line, total_line::float8 as total_line,
                   home_spread_odds, away_spread_odds, over_odds, under_odds,
                   home_moneyline, away_moneyline
            from raw.schedules where game_id = any(%s)
            """,
            (game_ids,),
        )
        verd = read_sql(
            """
            select run_id::text, game_id, market_line_id, payload
            from model.verdicts_latest where run_id = %s
            """,
            (rid,),
        )
        n_verdicts += verd.height
        verd_by_game = {row["game_id"]: row for row in verd.to_dicts()}
        sched_by = {row["game_id"]: row for row in sched.to_dicts()}
        snaps_by: dict[str, list[dict]] = {}
        for s in snaps.to_dicts():
            snaps_by.setdefault(s["game_id"], []).append(s)
        n_by = {gid: len(ss) for gid, ss in snaps_by.items()}
        bet_by: dict[int, dict] = {s["id"]: s for ss in snaps_by.values() for s in ss}

        for gid, part in edges.group_by("game_id"):
            game_id = gid[0] if isinstance(gid, tuple) else gid
            sc = sched_by[game_id]
            if sc.get("result") is None:
                unplayed.add(game_id)
                continue
            kick = kickoff_at(sc["gameday"], sc.get("gametime"))
            close = pick_close(snaps_by.get(game_id, []), kick, sc)
            game = {"game_id": game_id, "result": sc["result"], "total": sc["total"],
                    "n_snapshots": n_by.get(game_id, 0),
                    "home_team": sc["home_team"], "away_team": sc["away_team"]}
            meta[(rid, game_id)] = {
                "matchup": f"{sc['away_team']}@{sc['home_team']}", "result": sc["result"],
            }
            vrow = verd_by_game.get(game_id)
            for (mlid,), erows in part.group_by("market_line_id"):
                mlid = mlid[0] if isinstance(mlid, tuple) else mlid
                bet = dict(bet_by[int(mlid)])
                graded = grade_snapshot(erows.to_dicts(), bet, close, game, vrow)
                for row in graded:
                    row["run_id"] = rid
                    all_rows.append(row)

    if all_rows:
        df = pl.DataFrame(all_rows, infer_schema_length=None)
        now = datetime.now(ET)
        written = df.with_columns(pl.lit(now).alias("graded_at"))
        upsert(written, "model.results", RESULTS_KEY)
    else:
        df = pl.DataFrame()

    picks = _picks_table(df, float(cfg["flat_edge"]), float(cfg["strong_edge"])) if not df.is_empty() else pl.DataFrame()
    verd_tbl = _verdicts_table(df) if not df.is_empty() else pl.DataFrame()
    games_tbl = _games_table(df, meta) if not df.is_empty() else pl.DataFrame()
    cal, brier_s, brier_c, mono = (_calibration_tables(df) if not df.is_empty()
                                   else (pl.DataFrame(), None, None, None))
    return GradeReport(
        season=season, week=week, run_ids=kept_runs, n_rows=df.height if not df.is_empty() else 0,
        n_verdicts=n_verdicts, skipped_unplayed=len(unplayed), skipped_no_parquet=skipped_pq,
        picks=picks, verdicts=verd_tbl, games=games_tbl, calibration=cal,
        brier_sim=brier_s, brier_close=brier_c, monotone=mono,
    )
