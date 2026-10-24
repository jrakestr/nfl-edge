"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { checkPointEdit, type PointEdit } from "@/lib/player-edit";

export type PointEditResult = { ok: true } | { ok: false; error: string };

/**
 * Saves the plus/minus copy on the players table. Display only.
 * The sim projection is not changed.
 */
export async function savePlayerDelta(input: PointEdit): Promise<PointEditResult> {
  const error = checkPointEdit(input);
  if (error) return { ok: false, error };
  try {
    await sql()`
      insert into model.player_point_edits (season, week, player_id, delta)
      values (${input.season}, ${input.week}, ${input.playerId}, ${input.delta})
      on conflict (season, week, player_id)
      do update set delta = excluded.delta, updated_at = now()`;
  } catch (e) {
    if ((e as { code?: string }).code === "42P01") {
      return { ok: false, error: "The edit table is not in the database yet." };
    }
    throw e;
  }
  revalidatePath(`/week/${input.week}/players/${input.site}/${input.slate}`);
  return { ok: true };
}
