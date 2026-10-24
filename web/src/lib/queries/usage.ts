import { sql } from "@/lib/db";
import type { DefenseVsPosition, PlayerUsage, RateMetric, RateRank, UsageRates, UsageWeek, UsageWindow } from "@/lib/usage";

function num(v: unknown): number | null {
  return v == null ? null : Number(v);
}

/** Minimum games and opportunities (targets + carries + dropbacks) before a player is ranked at his position. */
const RANK_MIN_GAMES = 3;
const RANK_MIN_OPPS = 15;

const RANKED: RateMetric[] = [
  "dk_pg",
  "fp_per_target",
  "fp_per_opportunity",
  "fp_per_touch",
  "fp_per_snap",
  "fp_per_route_est",
  "fp_per_rush",
  "fp_per_dropback",
  "target_share",
  "snap_pct",
  "routes_pg_est",
  "yprr_est",
  "tprr_est",
  "wopr",
  "air_yds_pg",
];

/**
 * Season-to-date, last-5, and last-3 usage rates for one player, as of `week` (reads `week < week` only),
 * with his rank at the position for each rate and his week-by-week usage rows.
 */
export async function playerUsage(playerId: string, season: number, week: number): Promise<PlayerUsage> {
  const [rates, ranks, weeks] = await Promise.all([
    sql()`
      with g as (
        select u.* from model.player_usage_weekly u
        where u.player_id = ${playerId} and u.season = ${season} and u.week < ${week}
      ),
      win as (
        select 'season'::text as w, g.* from g
        union all
        select 'l5', g.* from (select * from g order by week desc limit 5) g
        union all
        select 'l3', g.* from (select * from g order by week desc limit 3) g
      )
      select w as win, count(*)::int as games,
             avg(fpts_dk)::float8 as dk_pg, avg(fpts_ppr)::float8 as ppr_pg, avg(fpts_half)::float8 as half_pg,
             avg(fpts_std)::float8 as std_pg, avg(fpts_ppr_6pt)::float8 as ppr_6pt_pg,
             (sum(fpts_dk) / nullif(sum(targets), 0))::float8 as fp_per_target,
             (sum(fpts_dk) / nullif(sum(opportunities), 0))::float8 as fp_per_opportunity,
             (sum(fpts_dk) / nullif(sum(touches), 0))::float8 as fp_per_touch,
             (sum(fpts_dk) / nullif(sum(offense_snaps), 0))::float8 as fp_per_snap,
             (sum(fpts_dk) / nullif(sum(routes_est), 0))::float8 as fp_per_route_est,
             (sum(fpts_dk) / nullif(sum(carries), 0))::float8 as fp_per_rush,
             (sum(fpts_dk) / nullif(sum(dropbacks), 0))::float8 as fp_per_dropback,
             (sum(fpts_dk) / nullif(sum(attempts), 0))::float8 as fp_per_attempt,
             avg(target_share)::float8 as target_share,
             avg(offense_pct)::float8 as snap_pct,
             avg(routes_est)::float8 as routes_pg_est,
             avg(targets)::float8 as targets_pg,
             avg(carries)::float8 as carries_pg,
             (sum(rec_yds) / nullif(sum(routes_est), 0))::float8 as yprr_est,
             (sum(targets) / nullif(sum(routes_est), 0))::float8 as tprr_est,
             avg(air_yds)::float8 as air_yds_pg,
             avg(wopr)::float8 as wopr
      from win group by w`,
    sql()`
      with agg as (
        select u.player_id, u.position, count(*)::int as games,
               avg(fpts_dk) as dk_pg,
               sum(fpts_dk) / nullif(sum(targets), 0) as fp_per_target,
               sum(fpts_dk) / nullif(sum(opportunities), 0) as fp_per_opportunity,
               sum(fpts_dk) / nullif(sum(touches), 0) as fp_per_touch,
               sum(fpts_dk) / nullif(sum(offense_snaps), 0) as fp_per_snap,
               sum(fpts_dk) / nullif(sum(routes_est), 0) as fp_per_route_est,
               sum(fpts_dk) / nullif(sum(carries), 0) as fp_per_rush,
               sum(fpts_dk) / nullif(sum(dropbacks), 0) as fp_per_dropback,
               avg(target_share) as target_share,
               avg(offense_pct) as snap_pct,
               avg(routes_est) as routes_pg_est,
               sum(rec_yds) / nullif(sum(routes_est), 0) as yprr_est,
               sum(targets) / nullif(sum(routes_est), 0) as tprr_est,
               avg(wopr) as wopr,
               avg(air_yds) as air_yds_pg
        from model.player_usage_weekly u
        where u.season = ${season} and u.week < ${week}
          and u.position = (select position from model.player_usage_weekly where player_id = ${playerId} limit 1)
        group by u.player_id, u.position
        having count(*) >= ${RANK_MIN_GAMES} and sum(opportunities) + sum(dropbacks) >= ${RANK_MIN_OPPS}
      ),
      ranked as (
        select player_id, count(*) over () as of_n,
               rank() over (order by dk_pg desc nulls last) as dk_pg,
               rank() over (order by fp_per_target desc nulls last) as fp_per_target,
               rank() over (order by fp_per_opportunity desc nulls last) as fp_per_opportunity,
               rank() over (order by fp_per_touch desc nulls last) as fp_per_touch,
               rank() over (order by fp_per_snap desc nulls last) as fp_per_snap,
               rank() over (order by fp_per_route_est desc nulls last) as fp_per_route_est,
               rank() over (order by fp_per_rush desc nulls last) as fp_per_rush,
               rank() over (order by fp_per_dropback desc nulls last) as fp_per_dropback,
               rank() over (order by target_share desc nulls last) as target_share,
               rank() over (order by snap_pct desc nulls last) as snap_pct,
               rank() over (order by routes_pg_est desc nulls last) as routes_pg_est,
               rank() over (order by yprr_est desc nulls last) as yprr_est,
               rank() over (order by tprr_est desc nulls last) as tprr_est,
               rank() over (order by wopr desc nulls last) as wopr,
               rank() over (order by air_yds_pg desc nulls last) as air_yds_pg
        from agg
      )
      select * from ranked where player_id = ${playerId}`,
    sql()`
      select season, week, opponent, offense_pct::float8 as snap_pct, routes_est::float8 as routes_est,
             targets::float8 as targets, carries::float8 as carries, target_share::float8 as target_share,
             fpts_dk::float8 as fpts_dk, fpts_ppr::float8 as fpts_ppr
      from model.player_usage_weekly
      where player_id = ${playerId} and season = ${season} and week < ${week}
      order by week desc`,
  ]);

  const toRates = (r: Record<string, unknown>): UsageRates => ({
    window: String(r.win) as UsageWindow,
    games: Number(r.games),
    dk_pg: num(r.dk_pg),
    ppr_pg: num(r.ppr_pg),
    half_pg: num(r.half_pg),
    std_pg: num(r.std_pg),
    ppr_6pt_pg: num(r.ppr_6pt_pg),
    fp_per_target: num(r.fp_per_target),
    fp_per_opportunity: num(r.fp_per_opportunity),
    fp_per_touch: num(r.fp_per_touch),
    fp_per_snap: num(r.fp_per_snap),
    fp_per_route_est: num(r.fp_per_route_est),
    fp_per_rush: num(r.fp_per_rush),
    fp_per_dropback: num(r.fp_per_dropback),
    fp_per_attempt: num(r.fp_per_attempt),
    target_share: num(r.target_share),
    snap_pct: num(r.snap_pct),
    routes_pg_est: num(r.routes_pg_est),
    targets_pg: num(r.targets_pg),
    carries_pg: num(r.carries_pg),
    yprr_est: num(r.yprr_est),
    tprr_est: num(r.tprr_est),
    air_yds_pg: num(r.air_yds_pg),
    wopr: num(r.wopr),
  });
  const byWindow = new Map(rates.map((r) => [String(r.win), toRates(r as Record<string, unknown>)]));
  const rankRow = ranks[0] as Record<string, unknown> | undefined;
  const rankList: RateRank[] = rankRow
    ? RANKED.flatMap((metric) =>
        rankRow[metric] == null ? [] : [{ metric, rank: Number(rankRow[metric]), of: Number(rankRow.of_n) }],
      )
    : [];
  return {
    season: byWindow.get("season") ?? null,
    l5: byWindow.get("l5") ?? null,
    l3: byWindow.get("l3") ?? null,
    ranks: rankList,
    weeks: weeks.map(
      (r): UsageWeek => ({
        season: Number(r.season),
        week: Number(r.week),
        opponent: r.opponent == null ? null : String(r.opponent),
        snap_pct: num(r.snap_pct),
        routes_est: num(r.routes_est),
        targets: Number(r.targets ?? 0),
        carries: Number(r.carries ?? 0),
        target_share: num(r.target_share),
        fpts_dk: num(r.fpts_dk),
        fpts_ppr: num(r.fpts_ppr),
      }),
    ),
  };
}

/** DK points a defense has allowed per game to one position, as of `week`, with its league rank. */
export async function defenseVsPosition(
  season: number,
  week: number,
  defense: string | null,
  position: string | null,
): Promise<DefenseVsPosition | null> {
  if (!defense || !position) return null;
  const rows = await sql()`
    with pg as (
      select opponent as defense, week, sum(fpts_dk) as pts
      from model.player_usage_weekly
      where season = ${season} and week < ${week} and position = ${position} and opponent is not null
      group by opponent, week
    ),
    per_def as (
      select defense, avg(pts) as allowed_pg, count(*)::int as games from pg group by defense
    ),
    ranked as (
      select defense, allowed_pg, games,
             rank() over (order by allowed_pg desc) as rank, count(*) over () as of_n,
             avg(allowed_pg) over () as league_avg
      from per_def
    )
    select * from ranked where defense = ${defense}`;
  const r = rows[0];
  if (!r) return null;
  return {
    defense,
    position,
    games: Number(r.games),
    allowed_pg: Number(r.allowed_pg),
    league_avg: Number(r.league_avg),
    rank: Number(r.rank),
    of: Number(r.of_n),
  };
}
