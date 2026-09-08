"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { STAT_ORDER } from "@/lib/prop-stats";

const STATS = new Set<string>(STAT_ORDER);

/** The one write the web app is allowed: a manual market line for a player-stat. */
export async function saveMarketLine(args: {
  season: number;
  week: number;
  playerId: string;
  playerName: string;
  stat: string;
  line: number;
  gameId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const line = Number(args.line);
  if (!Number.isFinite(line)) return { ok: false, error: "Need a number" };
  if (!STATS.has(args.stat)) return { ok: false, error: "Unknown stat" };
  const playerId = args.playerId.trim();
  if (!playerId) return { ok: false, error: "Missing player" };
  const name = args.playerName.trim() || playerId;
  await sql()`
    insert into model.market_props
      (season, week, player_id, player_name, stat, line, over_odds, under_odds, source)
    values
      (${args.season}, ${args.week}, ${playerId}, ${name}, ${args.stat}, ${line}, -110, -110, 'manual')`;
  revalidatePath("/props");
  if (args.gameId) revalidatePath(`/props/${args.gameId}/${playerId}`);
  return { ok: true };
}
