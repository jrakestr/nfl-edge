import { maxEdge } from "@/lib/edge";
import type { BoardRow } from "@/lib/types";

/** Rank: still to play by |edge|, then in-progress, then finals by kickoff. */
export function sortBoardRows(rows: BoardRow[]): BoardRow[] {
  return [...rows].sort((a, b) => {
    const rank = (r: BoardRow) => (r.is_final ? 2 : r.has_started ? 1 : 0);
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    if (a.is_final || a.has_started) {
      return `${a.gameday} ${a.gametime ?? ""}`.localeCompare(`${b.gameday} ${b.gametime ?? ""}`);
    }
    return maxEdge(b) - maxEdge(a);
  });
}
