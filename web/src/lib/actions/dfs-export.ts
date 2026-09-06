"use server";

import { formatUploadCsv } from "@/lib/dfs-upload";
import { dfsLineups } from "@/lib/queries/dfs";

/** SELECT-only: build a DK upload CSV for the chosen lineup_ids of this run/slate. */
export async function exportSelectedLineups(args: {
  runId: string;
  site: string;
  slateId: string;
  lineupIds: string[];
}): Promise<string> {
  const ids = new Set(args.lineupIds);
  if (ids.size === 0) return "";
  const all = await dfsLineups(args.runId, args.site, args.slateId);
  const picked = all.filter((r) => ids.has(r.lineup_id));
  return formatUploadCsv(args.runId, args.slateId, picked);
}
