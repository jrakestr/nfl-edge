import { sql } from "@/lib/db";

export type StagedClaim = {
  id: number;
  player_id: string;
  player_name: string;
  team: string;
  status: string;
  channel: string;
  usage_multiplier: number;
  source_url: string | null;
  quote: string | null;
  confidence: string;
  created_at: string;
  override_status: string | null;
  override_multiplier: number | null;
};

export async function claimsForWeek(season: number, week: number): Promise<StagedClaim[]> {
  const rows = await sql()`
    select c.id, c.player_id, c.player_name, c.team, c.status, c.channel,
           c.usage_multiplier::float8 as usage_multiplier, c.source_url, c.quote, c.confidence,
           c.created_at, o.status as override_status, o.usage_multiplier::float8 as override_multiplier
    from model.usage_claims c
    left join raw.player_overrides o
      on o.season = c.season and o.week = c.week and o.player_id = c.player_id
    where c.season = ${season} and c.week = ${week}
    order by c.created_at desc, c.id desc`;
  return rows.map((r) => ({
    id: Number(r.id),
    player_id: String(r.player_id),
    player_name: String(r.player_name),
    team: String(r.team),
    status: String(r.status),
    channel: String(r.channel),
    usage_multiplier: Number(r.usage_multiplier),
    source_url: (r.source_url as string | null) ?? null,
    quote: (r.quote as string | null) ?? null,
    confidence: String(r.confidence),
    created_at: String(r.created_at),
    override_status: (r.override_status as string | null) ?? null,
    override_multiplier: r.override_multiplier == null ? null : Number(r.override_multiplier),
  }));
}
