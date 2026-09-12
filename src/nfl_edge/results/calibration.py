"""Backtest: simulate past weeks from strictly-prior data and grade against closing lines and results.

For each week: priors(week) -> slate.run -> join raw.schedules (closing spread/total, result, total).
Report (output/backtest_{season}.md + CSVs):
  - fair spread/total vs closing: MAE, bias, correlation, per week and overall
  - P(home cover at closing) calibration in 10 buckets; Brier for home win vs a spread-implied baseline
  - invariant pass counts and market-gap warning counts from model.sim_checks
  - player baseline: Spearman(sim PPR mean, actual PPR) vs Spearman(-ECR, actual PPR), by position
  - leakage audit: priors source never touches outcomes; loaded history is strictly before the week
Acceptance: spread MAE <= 3, total MAE <= 4, calibration monotone, invariants 100%.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import polars as pl
from scipy.stats import norm, spearmanr

from ..config import ROOT
from ..db import read_sql
from ..priors import team as pteam
from ..priors import usage as pusage
from ..sim import slate

OUT = ROOT / "output"
ACCEPT = {"spread_mae": 3.0, "total_mae": 4.0}
SPREAD_SD = 13.5   # NFL margin sd used for the spread-implied win-probability baseline
POSITIONS = ("QB", "RB", "WR", "TE")


@dataclass
class Backtest:
    season: int
    weeks: list[int]
    run_ids: dict[int, str]
    games: pl.DataFrame
    players: pl.DataFrame
    checks: pl.DataFrame
    leakage: list[str]
    report_path: Path


# ----------------------------------------------------------------------------- data

def load_game_results(run_ids: dict[int, str]) -> pl.DataFrame:
    ids = list(run_ids.values())
    df = read_sql(
        """
        select r.week, g.run_id::text as run_id, g.game_id, s.home_team, s.away_team,
               g.fair_spread::float8 as fair_spread, g.fair_total::float8 as fair_total,
               g.home_win_prob::float8 as home_win_prob,
               g.p_home_cover_market::float8 as p_home_cover, g.p_over_market::float8 as p_over,
               s.spread_line::float8 as close_spread, s.total_line::float8 as close_total,
               s.result::float8 as result, s.total::float8 as total
        from model.proj_games g
        join model.sim_runs r on r.run_id = g.run_id
        join raw.schedules s on s.game_id = g.game_id
        where g.run_id = any(%s::uuid[])
        order by r.week, g.game_id
        """,
        (ids,),
    )
    return df.with_columns(
        (pl.col("fair_spread") - pl.col("close_spread")).alias("spread_err"),
        (pl.col("fair_total") - pl.col("close_total")).alias("total_err"),
        (pl.col("result") > pl.col("close_spread")).alias("home_covered"),
        (pl.col("result") == pl.col("close_spread")).alias("push"),
        (pl.col("result") > 0).cast(pl.Float64).alias("home_won"),
    )


def load_player_results(run_ids: dict[int, str], season: int) -> pl.DataFrame:
    """Sim PPR mean, ECR, and actual PPR per (week, player) for skill positions."""
    ids = list(run_ids.values())
    return read_sql(
        """
        with sim as (
            select r.week, p.player_id, p.team, p.position,
                   (p.stat_summary->'fpts_ppr'->>'mean')::float8 as sim_ppr
            from model.proj_players p join model.sim_runs r on r.run_id = p.run_id
            where p.run_id = any(%s::uuid[]) and p.position in ('QB','RB','WR','TE')
        ),
        ecr as (
            select f.week, x.gsis_id as player_id, f.ecr::float8 as ecr
            from raw.ff_rankings_weekly f
            join raw.players x on x.fantasypros_id = f.fp_id
            where f.season = %s and f.page_type in ('weekly-qb','weekly-rb','weekly-wr','weekly-te')
        ),
        act as (
            select week, player_id, (stats->>'fantasy_points_ppr')::float8 as actual_ppr
            from raw.player_stats_weekly where season = %s
        )
        select sim.week, sim.player_id, sim.team, sim.position, sim.sim_ppr, ecr.ecr,
               coalesce(act.actual_ppr, 0.0) as actual_ppr, act.player_id is not null as played
        from sim
        left join ecr on ecr.week = sim.week and ecr.player_id = sim.player_id
        left join act on act.week = sim.week and act.player_id = sim.player_id
        order by sim.week, sim.position, sim.sim_ppr desc
        """,
        (ids, season, season),
    )


def load_checks(run_ids: dict[int, str]) -> pl.DataFrame:
    ids = list(run_ids.values())
    return read_sql(
        """
        select r.week, c.severity, c.check_name, count(*) as n, sum(case when c.passed then 1 else 0 end) as passed
        from model.sim_checks c join model.sim_runs r on r.run_id = c.run_id
        where c.run_id = any(%s::uuid[])
        group by 1, 2, 3 order by 1, 2, 3
        """,
        (ids,),
    )


# ----------------------------------------------------------------------------- metrics

def line_metrics(g: pl.DataFrame) -> pl.DataFrame:
    def agg(df: pl.DataFrame, label) -> dict:
        f = df.filter(pl.col("close_spread").is_not_null() & pl.col("close_total").is_not_null())
        d = {
            "week": label, "games": f.height,
            "spread_mae": float(f["spread_err"].abs().mean()), "spread_bias": float(f["spread_err"].mean()),
            "total_mae": float(f["total_err"].abs().mean()), "total_bias": float(f["total_err"].mean()),
            "spread_corr": float(np.corrcoef(f["fair_spread"], f["close_spread"])[0, 1]) if f.height > 2 else np.nan,
            "total_corr": float(np.corrcoef(f["fair_total"], f["close_total"])[0, 1]) if f.height > 2 else np.nan,
        }
        r = f.filter(pl.col("result").is_not_null())
        if r.height:
            d["sim_vs_result_mae"] = float((r["fair_spread"] - r["result"]).abs().mean())
            d["close_vs_result_mae"] = float((r["close_spread"] - r["result"]).abs().mean())
            d["brier_sim"] = float(((r["home_win_prob"] - r["home_won"]) ** 2).mean())
            p_mkt = norm.cdf(r["close_spread"].to_numpy() / SPREAD_SD)
            d["brier_close"] = float(((p_mkt - r["home_won"].to_numpy()) ** 2).mean())
        return d

    rows = [agg(g.filter(pl.col("week") == w), int(w)) for w in sorted(g["week"].unique())]
    rows.append(agg(g, "all"))
    return pl.DataFrame(rows, strict=False)


def calibration_buckets(g: pl.DataFrame, col: str = "p_home_cover", hit: str = "home_covered",
                        n_buckets: int = 10) -> pl.DataFrame:
    f = g.filter(pl.col(col).is_not_null() & pl.col("result").is_not_null() & ~pl.col("push"))
    edges = np.linspace(0, 1, n_buckets + 1)
    b = np.clip(np.digitize(f[col].to_numpy(), edges[1:-1]), 0, n_buckets - 1)
    f = f.with_columns(pl.Series("bucket", b))
    return f.group_by("bucket").agg(
        pl.len().alias("n"), pl.col(col).mean().alias("mean_prob"),
        pl.col(hit).cast(pl.Float64).mean().alias("hit_rate"),
    ).sort("bucket").with_columns(
        (pl.col("bucket") / n_buckets).alias("lo"), ((pl.col("bucket") + 1) / n_buckets).alias("hi")
    )


def is_monotone(buckets: pl.DataFrame, min_n: int = 5) -> bool:
    h = buckets.filter(pl.col("n") >= min_n)["hit_rate"].to_numpy()
    return bool(len(h) >= 2 and (np.diff(h) >= -0.05).all())   # allow small noise reversals


def player_metrics(p: pl.DataFrame) -> pl.DataFrame:
    """Per position: mean weekly Spearman of sim and of ECR vs actual PPR, on players ranked by both."""
    rows = []
    both = p.filter(pl.col("ecr").is_not_null())
    for pos in POSITIONS:
        sims, ecrs, ns = [], [], []
        for w in sorted(both["week"].unique()):
            f = both.filter((pl.col("position") == pos) & (pl.col("week") == w))
            if f.height < 8:
                continue
            a = f["actual_ppr"].to_numpy()
            sims.append(spearmanr(f["sim_ppr"].to_numpy(), a).statistic)
            ecrs.append(spearmanr(-f["ecr"].to_numpy(), a).statistic)
            ns.append(f.height)
        if ns:
            rows.append({"position": pos, "weeks": len(ns), "players_per_week": float(np.mean(ns)),
                         "spearman_sim": float(np.nanmean(sims)), "spearman_ecr": float(np.nanmean(ecrs)),
                         "sim_minus_ecr": float(np.nanmean(sims) - np.nanmean(ecrs))})
    return pl.DataFrame(rows)


# ----------------------------------------------------------------------------- leakage audit

OUTCOME_TOKENS = re.compile(r"\b(result|home_score|away_score|total_line|spread_line|moneyline|overtime)\b")
SCHEDULE_TOKEN = re.compile(r"raw\.schedules")


def leakage_audit(season: int, weeks: list[int]) -> list[str]:
    """Static + dynamic checks that priors never see the target week or game outcomes."""
    findings: list[str] = []
    src = ROOT / "src" / "nfl_edge" / "priors"
    sched_refs = []
    for f in sorted(src.glob("*.py")):
        for i, line in enumerate(f.read_text().splitlines(), 1):
            s = line.strip()
            if s.startswith(("#", '"""', "'''")):
                continue
            if OUTCOME_TOKENS.search(line):
                findings.append(f"FAIL static: {f.name}:{i} references an outcome token: {s}")
            elif SCHEDULE_TOKEN.search(line):
                sched_refs.append(f"{f.name}:{i}")
    if not any(x.startswith("FAIL static") for x in findings):
        findings.append("PASS static: priors/*.py never reference result, scores, lines, or overtime")
    findings.append(
        f"NOTE static: priors read raw.schedules only for week-W starters / gamedays at {sched_refs}"
        if sched_refs else "NOTE static: priors do not read raw.schedules"
    )
    sim_src = (ROOT / "src" / "nfl_edge" / "sim" / "slate.py").read_text()
    if re.search(r"\bs\.(result|total|home_score|away_score)\b", sim_src):
        findings.append("FAIL static: sim/slate.py selects game outcomes from raw.schedules")
    else:
        findings.append("PASS static: sim/slate.py selects no outcome columns from raw.schedules")

    findings.append(
        "NOTE assumption: usage priors take each team's roster status at week <= target week "
        "(pre-kickoff information a live run also has); stats/opportunity/team aggregates are strictly earlier"
    )
    for w in sorted({weeks[0], weeks[len(weeks) // 2], weeks[-1]}):
        tg = pteam.load_team_games(season, w)
        pw = pusage.load_player_weeks(season, w)
        for name, df in (("team_game_agg", tg), ("player_weeks", pw)):
            cur = df.filter(pl.col("season") == season)
            mx = int(cur["week"].max()) if cur.height else -1
            seasons = sorted(df["season"].unique().to_list())
            ok = mx < w and all(s in (season - 1, season) for s in seasons)
            findings.append(
                f"{'PASS' if ok else 'FAIL'} dynamic: {name} for week {w} has max current-season week {mx} "
                f"(< {w}), seasons {seasons}"
            )
    return findings


# ----------------------------------------------------------------------------- report

def _fmt(df: pl.DataFrame, digits: int = 3) -> str:
    cols = df.columns
    out = ["| " + " | ".join(cols) + " |", "|" + "---|" * len(cols)]
    for row in df.iter_rows():
        cells = []
        for v in row:
            if isinstance(v, float):
                cells.append("" if np.isnan(v) else f"{v:.{digits}f}")
            else:
                cells.append(str(v))
        out.append("| " + " | ".join(cells) + " |")
    return "\n".join(out)


def write_report(bt: Backtest, draws: int) -> Path:
    OUT.mkdir(exist_ok=True)
    lm = line_metrics(bt.games)
    overall = lm.filter(pl.col("week") == "all").row(0, named=True)
    cal = calibration_buckets(bt.games)
    cal_total = calibration_buckets(bt.games.with_columns((pl.col("total") > pl.col("close_total")).alias("over_hit"),
                                                          (pl.col("total") == pl.col("close_total")).alias("push")),
                                    col="p_over", hit="over_hit")
    pm = player_metrics(bt.players)
    inv = bt.checks.filter(pl.col("severity") == "invariant")
    warn = bt.checks.filter(pl.col("severity") == "warning")
    inv_n, inv_p = int(inv["n"].sum()), int(inv["passed"].sum())
    warn_n, warn_p = int(warn["n"].sum()), int(warn["passed"].sum())
    mono = is_monotone(cal)
    accept = {
        f"spread MAE <= {ACCEPT['spread_mae']}": overall["spread_mae"] <= ACCEPT["spread_mae"],
        f"total MAE <= {ACCEPT['total_mae']}": overall["total_mae"] <= ACCEPT["total_mae"],
        "cover calibration monotone": mono,
        "invariants 100%": inv_n > 0 and inv_p == inv_n,
    }
    beats_close = (overall.get("sim_vs_result_mae", np.inf) < overall.get("close_vs_result_mae", 0)
                   and overall["games"] >= 100)
    comfortable = overall["spread_mae"] < 1.5 or overall["total_mae"] < 2.0 or beats_close
    leak_fail = any(x.startswith("FAIL") for x in bt.leakage)

    nan = float("nan")
    headline = (
        f"Overall: spread MAE {overall['spread_mae']:.2f} (bias {overall['spread_bias']:+.2f}, corr "
        f"{overall['spread_corr']:.3f}); total MAE {overall['total_mae']:.2f} (bias {overall['total_bias']:+.2f}, "
        f"corr {overall['total_corr']:.3f}). Sim vs result MAE {overall.get('sim_vs_result_mae', nan):.2f} "
        f"vs closing-line MAE {overall.get('close_vs_result_mae', nan):.2f}. "
        f"Brier(home win): sim {overall.get('brier_sim', nan):.4f}, spread-implied "
        f"{overall.get('brier_close', nan):.4f}."
    )
    lines = [
        f"# Backtest {bt.season} — weeks {bt.weeks[0]}–{bt.weeks[-1]}, {draws} draws/game",
        "",
        "## Acceptance",
        "",
        *[f"- {'PASS' if ok else 'FAIL'}: {k}" for k, ok in accept.items()],
        "",
        headline,
        "",
        ("Leakage smell: results beat thresholds comfortably (or the sim beats the closing line on outcomes); "
         "audit below must be clean before this counts."
         if comfortable else "No leakage smell from the headline numbers (errors are in the expected v1 range)."),
        "",
        "## Per week",
        "",
        _fmt(lm.select(["week", "games", "spread_mae", "spread_bias", "total_mae", "total_bias",
                        "sim_vs_result_mae", "close_vs_result_mae", "brier_sim", "brier_close"]), 2),
        "",
        "## Calibration: P(home cover at closing spread) vs hit rate",
        "",
        _fmt(cal.select(["lo", "hi", "n", "mean_prob", "hit_rate"]), 2),
        "",
        f"Monotone (buckets with n>=5, reversals <= 0.05 allowed): {mono}",
        "",
        "## Calibration: P(over closing total) vs hit rate",
        "",
        _fmt(cal_total.select(["lo", "hi", "n", "mean_prob", "hit_rate"]), 2),
        "",
        "## Consistency checks",
        "",
        f"- invariants: {inv_p}/{inv_n} passed",
        f"- market-gap warnings: {warn_n - warn_p}/{warn_n} flagged",
        "",
        _fmt(bt.checks.group_by(["severity", "check_name"]).agg(pl.col("n").sum(), pl.col("passed").sum())
             .sort(["severity", "check_name"])),
        "",
        "## Player baseline: sim PPR mean vs FantasyPros weekly ECR (Spearman with actual PPR)",
        "",
        _fmt(pm) if not pm.is_empty() else "_no overlapping ECR rows_",
        "",
        "Positive `sim_minus_ecr` means the sim ranks players better than consensus that week on average.",
        "",
        "## Leakage audit",
        "",
        *[f"- {x}" for x in bt.leakage],
        "",
        f"Audit {'FAILED' if leak_fail else 'clean'}.",
        "",
        "## Run ids",
        "",
        *[f"- week {w}: `{r}`" for w, r in sorted(bt.run_ids.items())],
        "",
    ]
    path = OUT / f"backtest_{bt.season}.md"
    path.write_text("\n".join(lines))
    bt.games.write_csv(OUT / f"backtest_{bt.season}_games.csv")
    bt.players.write_csv(OUT / f"backtest_{bt.season}_players.csv")
    lm.write_csv(OUT / f"backtest_{bt.season}_weekly.csv")
    return path


def run(season: int, weeks: list[int], draws: int = 5000, seed: int | None = None,
        note: str | None = None) -> Backtest:
    run_ids: dict[int, str] = {}
    for w in weeks:
        r = slate.run(season, w, draws=draws, seed=seed, note=note or f"backtest {season}")
        run_ids[w] = r.run_id
        print(r.summary())
    games = load_game_results(run_ids)
    players = load_player_results(run_ids, season)
    checks = load_checks(run_ids)
    leakage = leakage_audit(season, weeks)
    bt = Backtest(season, weeks, run_ids, games, players, checks, leakage, OUT / f"backtest_{season}.md")
    bt.report_path = write_report(bt, draws)
    return bt


# ----------------------------------------------------------------------------- season grading (model.results)
def _wlp(df: pl.DataFrame) -> tuple[int, int, int]:
    return (df.filter(pl.col("outcome") == 1).height,
            df.filter(pl.col("outcome") == 0).height,
            df.filter(pl.col("outcome").is_null()).height)


def _week_pick_row(week, df: pl.DataFrame) -> dict:
    picks = df.filter(pl.col("is_last_snapshot") & (pl.col("edge") > 0))
    w, l, p = _wlp(picks)
    side = df.filter(pl.col("verdict_pick") & (pl.col("market_type") == "spread"))
    tot = df.filter(pl.col("verdict_pick") & (pl.col("market_type") == "total"))
    calls = df.filter(pl.col("verdict_call").is_in(["pays", "does not pay"])
                      & pl.col("outcome").is_not_null())
    correct = 0
    for r in calls.iter_rows(named=True):
        if ((r["verdict_call"] == "pays" and r["outcome"] == 1)
                or (r["verdict_call"] == "does not pay" and r["outcome"] == 0)):
            correct += 1
    clv_pts = picks.filter(pl.col("clv_points").is_not_null())
    stake = float(picks["kelly_fraction"].sum()) if picks.height else 0.0
    sw, sl, sp = _wlp(side)
    tw, tl, tp = _wlp(tot)
    return {
        "week": week, "n": picks.height, "record": f"{w}-{l}-{p}",
        "flat_roi": float(picks["pnl"].mean()) if picks.height else float("nan"),
        "kelly_roi": float(picks["pnl_kelly"].sum() / stake) if stake else 0.0,
        "mean_clv_points": float(clv_pts["clv_points"].mean()) if clv_pts.height else float("nan"),
        "mean_clv": float(picks["clv"].mean()) if picks.height else float("nan"),
        "pct_clv_pos": float((clv_pts["clv_points"] > 0).mean()) if clv_pts.height else float("nan"),
        "side_record": f"{sw}-{sl}-{sp}", "total_record": f"{tw}-{tl}-{tp}",
        "cover_n": calls.height,
        "cover_acc": (correct / calls.height) if calls.height else float("nan"),
    }


def results_report(season: int, weeks: list[int] | None = None) -> Path:
    """Per-week and cumulative grading from model.results.

    Default curve is predated_kickoff rows only — whatever grade.py wrote before
    kickoff. A week may have more than one run_id. Hindsight/fallback rows stay
    in the table and are listed, not scored.
    """
    df = read_sql(
        """
        select r.season, r.week, r.run_id::text as run_id, r.created_at,
               res.market_type, res.side, res.model_prob::float8 as model_prob,
               res.closing_prob::float8 as closing_prob, res.outcome, res.clv::float8 as clv,
               res.edge::float8 as edge, res.kelly_fraction::float8 as kelly_fraction,
               res.clv_points::float8 as clv_points, res.pnl::float8 as pnl,
               res.pnl_kelly::float8 as pnl_kelly, res.actual::float8 as actual,
               res.is_last_snapshot, res.verdict_pick, res.verdict_call, res.close_source,
               res.predated_kickoff
        from model.results res
        join model.sim_runs r on r.run_id = res.run_id
        where r.season = %s
        """,
        (season,),
    )
    if weeks and df.height:
        df = df.filter(pl.col("week").is_in(weeks))
    OUT.mkdir(exist_ok=True)
    path = OUT / f"grading_{season}.md"
    clv_note = (
        "CLV columns are structurally zero on backfilled seasons (snapshots were captured after "
        "kickoff, so the close is the schedules fallback equal to the bet line). They are "
        "informative from 2026 Week 1 onward, once the lines-only cron is producing pre-kickoff "
        "snapshots."
    )
    if df.is_empty():
        path.write_text(f"# Grading {season}\n\n{clv_note}\n\n_no graded rows_\n")
        return path

    hindsight = df.filter(~pl.col("predated_kickoff"))
    primary = df.filter(pl.col("predated_kickoff"))
    if primary.is_empty():
        path.write_text(
            f"# Grading {season}\n\n{clv_note}\n\n_no predated-kickoff rows_\n"
        )
        return path

    listed = (
        primary.select(["week", "run_id", "created_at"]).unique()
        .sort(["week", "created_at"])
    )
    week_ids = listed["week"].unique().sort()
    other = (
        hindsight.select(["week", "run_id", "created_at"]).unique()
        .sort(["week", "created_at"])
        if hindsight.height else pl.DataFrame()
    )

    week_rows = [_week_pick_row(int(w), primary.filter(pl.col("week") == w))
                 for w in week_ids.to_list()]
    weekly = pl.DataFrame(week_rows, strict=False)
    cumul = pl.DataFrame([_week_pick_row("all", primary)], strict=False)

    last = primary.filter(pl.col("is_last_snapshot") & pl.col("outcome").is_not_null()
                          & pl.col("model_prob").is_not_null())
    both = last.filter(pl.col("closing_prob").is_not_null())
    nan = float("nan")
    brier_sim = brier_close = nan
    if both.height:
        y = both["outcome"].to_numpy().astype(float)
        brier_sim = float(((both["model_prob"].to_numpy() - y) ** 2).mean())
        brier_close = float(((both["closing_prob"].to_numpy() - y) ** 2).mean())
    src = last.with_columns(
        pl.col("actual").alias("result"), pl.lit(False).alias("push"),
        (pl.col("outcome") == 1).alias("hit"),
    )
    buckets = calibration_buckets(src, col="model_prob", hit="hit") if last.height else pl.DataFrame()
    mono = is_monotone(buckets) if last.height else False

    others_md = (
        "\n".join(f"- week {r['week']}: `{r['run_id']}`" for r in other.iter_rows(named=True))
        if other.height else "_none_"
    )
    chosen_md = "\n".join(
        f"- week {r['week']}: `{r['run_id']}`" for r in listed.iter_rows(named=True)
    )
    lines = [
        f"# Grading {season}",
        "",
        clv_note,
        "",
        "## Predated-kickoff runs (in the tables)",
        "",
        chosen_md,
        "",
        "## Hindsight / fallback rows (listed, not in the tables)",
        "",
        others_md,
        "",
        "## Per week (picks with is_last_snapshot and edge > 0)",
        "",
        _fmt(weekly, 3),
        "",
        "## Cumulative",
        "",
        _fmt(cumul, 3),
        "",
        "## Calibration: model_prob vs hit rate (last snapshot, non-push)",
        "",
        _fmt(buckets.select(["lo", "hi", "n", "mean_prob", "hit_rate"]), 2) if not buckets.is_empty()
        else "_no rows_",
        "",
        f"Monotone (buckets with n>=5, reversals <= 0.05 allowed): {mono}",
        "",
        f"Brier sim {brier_sim:.4f} vs close {brier_close:.4f}.",
        "",
    ]
    path.write_text("\n".join(lines))
    primary.write_csv(OUT / f"grading_{season}_results.csv")
    return path
