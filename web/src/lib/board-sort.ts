import type { BoardRow } from "@/lib/types";

export function kickoffSortKey(r: { gameday: string; gametime: string | null; game_id: string }): string {
  return `${r.gameday} ${r.gametime ?? "99:99"} ${r.game_id}`;
}

/** Ascending by kickoff (gameday, gametime, game_id) — first to last game played. */
export function sortBoardRows(rows: BoardRow[]): BoardRow[] {
  return [...rows].sort((a, b) => kickoffSortKey(a).localeCompare(kickoffSortKey(b)));
}
