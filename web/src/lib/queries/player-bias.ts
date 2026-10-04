import { sql } from "@/lib/db";
import type { BiasCell, PlayerBiasData } from "@/lib/player-bias";

function num(v: unknown): number | null {
  return v == null ? null : Number(v);
}

/** Cells written by `nfl-edge grade` / `nfl-edge player-bias`, plus counts from the per-player table. */
export async function playerBias(season: number): Promise<PlayerBiasData> {
  const [cells, weeks, counts] = await Promise.all([
    sql()`
      select ord, dimension, label, n, projected::float8 as projected, actual::float8 as actual,
             mean_resid::float8 as mean_resid, mean_pct::float8 as mean_pct, mae::float8 as mae,
             se::float8 as se, weeks_graded, state, reason, owner
      from model.player_bias
      where season = ${season}
      order by ord`,
    sql()`
      select distinct week from model.player_proj_actual where season = ${season} order by week`,
    sql()`
      select count(*) filter (where had_opportunity and actual_dk is not null)::int as compared,
             count(*) filter (where not had_opportunity)::int as did_not_play
      from model.player_proj_actual where season = ${season}`,
  ]);
  return {
    cells: cells.map(
      (r): BiasCell => ({
        ord: Number(r.ord),
        dimension: String(r.dimension),
        label: String(r.label),
        n: Number(r.n),
        projected: num(r.projected),
        actual: num(r.actual),
        meanResid: num(r.mean_resid),
        meanPct: num(r.mean_pct),
        mae: num(r.mae),
        se: num(r.se),
        weeksGraded: Number(r.weeks_graded),
        state: String(r.state),
        reason: String(r.reason),
        owner: r.owner == null ? null : String(r.owner),
      }),
    ),
    weeks: weeks.map((r) => Number(r.week)),
    compared: Number(counts[0]?.compared ?? 0),
    didNotPlay: Number(counts[0]?.did_not_play ?? 0),
  };
}
