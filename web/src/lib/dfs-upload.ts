import type { DfsLineup } from "@/lib/types";

const SLOTS = ["QB", "RB", "RB2", "WR", "WR2", "WR3", "TE", "FLEX", "DST"] as const;
const SHOWDOWN_SLOTS = ["CPT", "FLEX", "FLEX2", "FLEX3", "FLEX4", "FLEX5"] as const;
const SHOWDOWN_HEADER = "CPT,FLEX,FLEX,FLEX,FLEX,FLEX";

/** DK upload CSV from selected lineups. IDs come from the stored slate; never remapped. */
export function formatUploadCsv(runId: string, slateId: string, lineups: DfsLineup[]): string {
  const showdown = lineups.some((lu) => lu.players.some((p) => p.slot === "CPT"));
  const header = showdown ? SHOWDOWN_HEADER : "QB,RB,RB,WR,WR,WR,TE,FLEX,DST";
  const lines = [`# nfl-edge run_id=${runId} slate_id=${slateId}`, header];
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
