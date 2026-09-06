import type { DfsLineup } from "@/lib/types";

const SLOTS = ["QB", "RB", "RB2", "WR", "WR2", "WR3", "TE", "FLEX", "DST"] as const;

/** DK upload CSV from selected lineups. IDs come from the stored slate; never remapped. */
export function formatUploadCsv(runId: string, slateId: string, lineups: DfsLineup[]): string {
  const lines = [`# nfl-edge run_id=${runId} slate_id=${slateId}`, "QB,RB,RB,WR,WR,WR,TE,FLEX,DST"];
  for (const lu of lineups) {
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
