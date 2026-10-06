"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";

/** Human promote: one staged claim → raw.player_overrides. Never called from the model path. */
export async function promoteClaim(claimId: number): Promise<{ ok: true } | { ok: false; error: string }> {
  const rows = await sql()`
    select id, season, week, player_id, status, usage_multiplier, quote
    from model.usage_claims where id = ${claimId} limit 1`;
  const c = rows[0] as
    | {
        season: number;
        week: number;
        player_id: string;
        status: string;
        usage_multiplier: number;
        quote: string | null;
      }
    | undefined;
  if (!c) return { ok: false, error: "Claim not found" };
  await sql()`
    insert into raw.player_overrides (season, week, player_id, status, usage_multiplier, note)
    values (${c.season}, ${c.week}, ${c.player_id}, ${c.status}, ${c.usage_multiplier}, ${c.quote ?? "promoted claim"})
    on conflict (season, week, player_id) do update set
      status = excluded.status,
      usage_multiplier = excluded.usage_multiplier,
      note = excluded.note,
      updated_at = now()`;
  revalidatePath(`/week/${c.week}/claims`);
  return { ok: true };
}
