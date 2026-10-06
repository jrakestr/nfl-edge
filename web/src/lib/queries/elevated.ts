import { sql } from "@/lib/db";

export type ElevatedInfo = { reason: string; depthAsOf: string | null };

/** Depth rank ≥ 2 and every teammate above is out/doubtful/ir this week. */
export async function elevatedByInjury(season: number, week: number): Promise<Map<string, ElevatedInfo>> {
  const rows = await sql()`
    with cutoff as (
      select min(gameday) as gameday from raw.schedules where season = ${season} and week = ${week}
    ),
    snap as (
      select max(dt) as dt from raw.depth_charts d, cutoff
      where d.season = ${season} and d.week is null and d.dt::date <= cutoff.gameday
    ),
    weekly as (
      select club_code, max(week) as week from raw.depth_charts
      where season = ${season} and week is not null and week <= ${week}
      group by club_code
    ),
    depth as (
      select d.club_code as team,
             case d.depth_position when 'FB' then 'RB' when 'HB' then 'RB' else d.depth_position end as position,
             d.gsis_id as player_id, d.depth_team as depth_rank, d.full_name,
             coalesce(d.dt, null) as dt
      from raw.depth_charts d
      join snap on snap.dt is not null and snap.dt = d.dt
      where d.season = ${season} and d.gsis_id is not null
      union all
      select d.club_code, case d.depth_position when 'FB' then 'RB' when 'HB' then 'RB' else d.depth_position end,
             d.gsis_id, d.depth_team, d.full_name, null
      from raw.depth_charts d
      join weekly w on w.club_code = d.club_code and w.week = d.week
      where d.season = ${season} and d.gsis_id is not null
        and not exists (select 1 from snap where dt is not null)
    )
    select d.player_id,
           min(d.dt)::text as depth_as_of,
           min(above.full_name) filter (where above.depth_rank = 1) as starter_name,
           min(above.position) filter (where above.depth_rank = 1) as starter_pos,
           bool_and(coalesce(o.status, '') in ('out', 'doubtful', 'ir')) as all_above_out
    from depth d
    join depth above
      on above.team = d.team and above.position = d.position and above.depth_rank < d.depth_rank
    left join raw.player_overrides o
      on o.player_id = above.player_id and o.season = ${season} and o.week = ${week}
    where d.depth_rank >= 2
    group by d.player_id
    having bool_and(coalesce(o.status, '') in ('out', 'doubtful', 'ir'))`;
  const m = new Map<string, ElevatedInfo>();
  for (const r of rows) {
    const pos = (r.starter_pos as string | null) ?? "POS";
    const name = (r.starter_name as string | null) ?? "starter";
    m.set(String(r.player_id), {
      reason: `${pos}1 ${name} out`,
      depthAsOf: (r.depth_as_of as string | null) ?? null,
    });
  }
  return m;
}
