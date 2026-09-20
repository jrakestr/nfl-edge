import type { DfsLineup } from "@/lib/types";

const SLOTS = ["QB", "RB", "RB2", "WR", "WR2", "WR3", "TE", "FLEX", "DST"] as const;
const SHOWDOWN_SLOTS = ["CPT", "FLEX", "FLEX2", "FLEX3", "FLEX4", "FLEX5"] as const;
const SHOWDOWN_HEADER = "CPT,FLEX,FLEX,FLEX,FLEX,FLEX";

export type UploadSource = "sim" | "user-optimized";

const UPLOAD_NAME =
  /^dk_upload_(.+)_([A-Za-z0-9-]{1,8})_(sim|user-optimized)\.csv$/;

/** Provenance for a DK upload: slate, first 8 of run_id, and source. */
export function uploadFilename(
  slateId: string,
  runId: string,
  source: UploadSource = "sim",
): string {
  return `dk_upload_${slateId}_${runId.slice(0, 8)}_${source}.csv`;
}

/** Read run/slate/source from the filename (and full run_id from the path). */
export function parseUploadStamp(pathOrName: string): {
  slateId: string;
  runIdPrefix: string;
  source: UploadSource;
  runId: string | null;
} {
  const parts = pathOrName.split("/").filter(Boolean);
  const name = parts.at(-1) ?? pathOrName;
  const m = name.match(UPLOAD_NAME);
  if (!m) {
    throw new Error(`not an nfl-edge upload filename: ${name}`);
  }
  const slateId = m[1]!;
  const runIdPrefix = m[2]!;
  const source = m[3] as UploadSource;
  let runId: string | null = null;
  if (parts.length >= 4) {
    const maybe = parts[parts.length - 4]!;
    if (maybe.startsWith(runIdPrefix)) runId = maybe;
  }
  return { slateId, runIdPrefix, source, runId };
}

/** DK upload CSV from selected lineups. IDs come from the stored slate; never remapped.
 *  Line 1 is the DK header — provenance is `uploadFilename`, not a comment. */
export function formatUploadCsv(lineups: DfsLineup[]): string {
  const showdown = lineups.some((lu) => lu.players.some((p) => p.slot === "CPT"));
  const header = showdown ? SHOWDOWN_HEADER : "QB,RB,RB,WR,WR,WR,TE,FLEX,DST";
  const lines = [header];
  for (const lu of lineups) {
    if (showdown) {
      const bySlot = new Map(lu.players.map((p) => [p.slot, p]));
      const cells = SHOWDOWN_SLOTS.map((slot) => {
        const p = bySlot.get(slot);
        if (!p) return "";
        return p.dk_id ? `${p.name} (${p.dk_id})` : p.name;
      });
      lines.push(cells.join(","));
      continue;
    }
    const bySlot = new Map(lu.players.map((p) => [p.slot, p]));
    const cells = SLOTS.map((slot) => {
      const p = bySlot.get(slot);
      if (!p) return "";
      return p.dk_id ? `${p.name} (${p.dk_id})` : p.name;
    });
    lines.push(cells.join(","));
  }
  return lines.join("\n") + "\n";
}
