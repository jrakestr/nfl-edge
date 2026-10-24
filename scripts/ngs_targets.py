"""NGS + usage + opponent defense targets for 2026 week 6 (as-of: weeks 1-5 only)."""
import csv
import sys

import nflreadpy as n
import polars as pl

SEASON, WEEK = 2026, 6
DK = sys.argv[1]  # full-slate DK CSV
OUT = sys.argv[2]
FIX = {"LAR": "LA", "WSH": "WAS", "JAC": "JAX"}

# --- slate: teams, opponents, salaries, DK status ---
with open(DK, encoding="utf-8-sig") as f:
    rows = list(csv.DictReader(f))
opp, kick, sal = {}, {}, {}
for r in rows:
    away, home = r["Game Info"].split(" ")[0].split("@")
    away, home = FIX.get(away, away), FIX.get(home, home)
    opp[away], opp[home] = home, away
    t = " ".join(r["Game Info"].split(" ")[2:3])
    kick[away] = kick[home] = t
    team = FIX.get(r["TeamAbbrev"], r["TeamAbbrev"])
    sal[(r["Name"].lower().replace(".", "").replace(" jr", "").replace(" iii", "").replace(" ii", ""), team)] = (
        int(r["Salary"]), r["Status"] or "")
teams = set(opp)


def key(name, team):
    return (name.lower().replace(".", "").replace(" jr", "").replace(" iii", "").replace(" ii", ""), team)


def weeks(df):
    return df.filter((pl.col("season") == SEASON) & (pl.col("week").is_between(1, WEEK - 1))
                     & (pl.col("season_type") == "REG"))


# --- defense from play-by-play (weeks 1-5) ---
pbp = weeks(n.load_pbp(seasons=[SEASON]))
plays = pbp.filter(pl.col("play_type").is_in(["pass", "run"]) & pl.col("epa").is_not_null())
d = plays.group_by("defteam").agg(
    pass_epa=pl.col("epa").filter(pl.col("play_type") == "pass").mean(),
    rush_epa=pl.col("epa").filter(pl.col("play_type") == "run").mean(),
    expl_pass=(pl.col("yards_gained").filter(pl.col("play_type") == "pass") >= 20).mean(),
    expl_rush=(pl.col("yards_gained").filter(pl.col("play_type") == "run") >= 10).mean(),
    plays=pl.len(),
).with_columns(
    pass_rank=pl.col("pass_epa").rank(descending=True).cast(pl.Int32),  # 1 = most generous
    rush_rank=pl.col("rush_epa").rank(descending=True).cast(pl.Int32),
)
off = plays.group_by("posteam").agg(
    off_epa=pl.col("epa").mean(),
    pass_rate=(pl.col("play_type") == "pass").mean(),
    sec_per_play=pl.len(),  # placeholder replaced below
)
games = pbp.group_by("posteam").agg(g=pl.col("game_id").n_unique())
off = off.join(games, on="posteam").with_columns(plays_pg=(pl.col("sec_per_play") / pl.col("g"))).drop("sec_per_play")
dmap = {r["defteam"]: r for r in d.to_dicts()}
omap = {r["posteam"]: r for r in off.to_dicts()}

# --- usage from weekly player stats ---
ps = weeks(n.load_player_stats(seasons=[SEASON]))
use = ps.group_by("player_id", "player_display_name", "position").agg(
    team=pl.col("team").last(), g=pl.len(),
    tgt=pl.col("targets").sum(), car=pl.col("carries").sum(),
    tgt_share=pl.col("target_share").mean(), ay_share=pl.col("air_yards_share").mean(),
    wopr=pl.col("wopr").mean(), rz=pl.lit(None),
)
umap = {r["player_id"]: r for r in use.to_dicts()}

# --- NGS, aggregated over weeks 1-5 (volume-weighted) ---
rec = weeks(n.load_nextgen_stats(stat_type="receiving", seasons=[SEASON]))
rec = rec.group_by("player_gsis_id", "player_display_name", "player_position").agg(
    team=pl.col("team_abbr").last(), tgt=pl.col("targets").sum(),
    sep=(pl.col("avg_separation") * pl.col("targets")).sum() / pl.col("targets").sum(),
    iay=(pl.col("avg_intended_air_yards") * pl.col("targets")).sum() / pl.col("targets").sum(),
    yacoe=(pl.col("avg_yac_above_expectation") * pl.col("receptions")).sum() / pl.col("receptions").sum(),
    ay_pct=pl.col("percent_share_of_intended_air_yards").mean(),
).filter(pl.col("tgt") >= 15)
rush = weeks(n.load_nextgen_stats(stat_type="rushing", seasons=[SEASON]))
rush = rush.group_by("player_gsis_id", "player_display_name", "player_position").agg(
    team=pl.col("team_abbr").last(), att=pl.col("rush_attempts").sum(),
    ryoe_att=(pl.col("rush_yards_over_expected_per_att") * pl.col("rush_attempts")).sum() / pl.col("rush_attempts").sum(),
    box8=(pl.col("percent_attempts_gte_eight_defenders") * pl.col("rush_attempts")).sum() / pl.col("rush_attempts").sum(),
    eff=(pl.col("efficiency") * pl.col("rush_attempts")).sum() / pl.col("rush_attempts").sum(),
).filter(pl.col("att") >= 25)
pas = weeks(n.load_nextgen_stats(stat_type="passing", seasons=[SEASON]))
pas = pas.group_by("player_gsis_id", "player_display_name").agg(
    team=pl.col("team_abbr").last(), att=pl.col("attempts").sum(),
    cpoe=(pl.col("completion_percentage_above_expectation") * pl.col("attempts")).sum() / pl.col("attempts").sum(),
    ttt=(pl.col("avg_time_to_throw") * pl.col("attempts")).sum() / pl.col("attempts").sum(),
    aggr=(pl.col("aggressiveness") * pl.col("attempts")).sum() / pl.col("attempts").sum(),
    iay=(pl.col("avg_intended_air_yards") * pl.col("attempts")).sum() / pl.col("attempts").sum(),
).filter(pl.col("att") >= 60)

out = [f"# Week {WEEK} NGS targets (2026 weeks 1–5 only)\n",
       "Defense rank: 1 = allows the most EPA per play (best matchup). Salary/status from the DK full slate file.\n"]


def line(cells):
    return "| " + " | ".join(str(c) for c in cells) + " |"


def fmt(x, nd=2):
    return "—" if x is None else (f"{x:.{nd}f}" if isinstance(x, float) else x)


# Receivers: separation + air-yard share, vs pass D
out += ["\n## Pass catchers\n", line(["Player", "Pos", "Team", "Opp", "Opp pass D", "Sal", "St", "Tgt", "Tgt share", "WOPR",
                                     "Sep (yd)", "aDOT", "YAC+exp", "Score"]),
        line(["---"] * 14)]
cands = []
for r in rec.to_dicts():
    t = FIX.get(r["team"], r["team"])
    if t not in teams:
        continue
    o = opp[t]
    dd = dmap.get(o, {})
    u = umap.get(r["player_gsis_id"], {})
    s, st = sal.get(key(r["player_display_name"], t), (None, ""))
    if s is None or st in ("O", "IR"):
        continue
    score = ((u.get("wopr") or 0) * 10 + (r["sep"] or 0) + (r["yacoe"] or 0) * 0.5
             + (16.5 - (dd.get("pass_rank") or 16.5)) * 0.15)
    cands.append((score, [r["player_display_name"], r["player_position"], t, o, dd.get("pass_rank", "—"), s, st or "",
                          r["tgt"], fmt(u.get("tgt_share")), fmt(u.get("wopr")), fmt(r["sep"]), fmt(r["iay"], 1),
                          fmt(r["yacoe"]), fmt(score)]))
for _, c in sorted(cands, reverse=True)[:25]:
    out.append(line(c))

# Rushers: RYOE/att, stacked boxes, vs rush D
out += ["\n## Running backs\n", line(["Player", "Team", "Opp", "Opp rush D", "Sal", "St", "Att", "RYOE/att", "8+ box %",
                                     "Tgt share", "Score"]), line(["---"] * 11)]
cands = []
for r in rush.to_dicts():
    t = FIX.get(r["team"], r["team"])
    if t not in teams or r["player_position"] != "RB":
        continue
    o = opp[t]
    dd = dmap.get(o, {})
    u = umap.get(r["player_gsis_id"], {})
    s, st = sal.get(key(r["player_display_name"], t), (None, ""))
    if s is None or st in ("O", "IR"):
        continue
    score = (r["ryoe_att"] or 0) + (u.get("tgt_share") or 0) * 8 + r["att"] / 25 + (16.5 - (dd.get("rush_rank") or 16.5)) * 0.1
    cands.append((score, [r["player_display_name"], t, o, dd.get("rush_rank", "—"), s, st or "", r["att"],
                          fmt(r["ryoe_att"]), fmt(r["box8"], 1), fmt(u.get("tgt_share")), fmt(score)]))
for _, c in sorted(cands, reverse=True)[:15]:
    out.append(line(c))

# QBs
out += ["\n## Quarterbacks\n", line(["Player", "Team", "Opp", "Opp pass D", "Sal", "St", "Att", "CPOE", "aDOT",
                                     "Aggr %", "Time to throw", "Team EPA/play", "Plays/g"]), line(["---"] * 13)]
cands = []
for r in pas.to_dicts():
    t = FIX.get(r["team"], r["team"])
    if t not in teams:
        continue
    o = opp[t]
    dd = dmap.get(o, {})
    om = omap.get(t, {})
    s, st = sal.get(key(r["player_display_name"], t), (None, ""))
    if s is None or st in ("O", "IR"):
        continue
    cands.append(((r["cpoe"] or 0) + (16.5 - (dd.get("pass_rank") or 16.5)) * 0.3,
                  [r["player_display_name"], t, o, dd.get("pass_rank", "—"), s, st or "", r["att"], fmt(r["cpoe"], 1),
                   fmt(r["iay"], 1), fmt(r["aggr"], 1), fmt(r["ttt"]), fmt(om.get("off_epa"), 3), fmt(om.get("plays_pg"), 1)]))
for _, c in sorted(cands, reverse=True):
    out.append(line(c))

# Team matchups
out += ["\n## Team matchups (offense vs opposing defense)\n",
        line(["Team", "Opp", "Kick ET", "Off EPA/play", "Pass rate", "Plays/g", "Opp pass EPA allowed", "Opp pass rank",
              "Opp 20+ yd pass %", "Opp rush EPA allowed", "Opp rush rank"]), line(["---"] * 11)]
tm = []
for t in sorted(teams):
    o = opp[t]
    om, dd = omap.get(t, {}), dmap.get(o, {})
    tm.append(((om.get("off_epa") or 0) + (dd.get("pass_epa") or 0),
               [t, o, kick.get(t, ""), fmt(om.get("off_epa"), 3), fmt(om.get("pass_rate")), fmt(om.get("plays_pg"), 1),
                fmt(dd.get("pass_epa"), 3), dd.get("pass_rank", "—"), fmt(dd.get("expl_pass"), 3),
                fmt(dd.get("rush_epa"), 3), dd.get("rush_rank", "—")]))
for _, c in sorted(tm, reverse=True):
    out.append(line(c))

with open(OUT, "w") as f:
    f.write("\n".join(out) + "\n")
print(f"wrote {OUT}; weeks in pbp: {sorted(pbp['week'].unique().to_list())}")
