import { sql } from "@/lib/db";
import type { HistoryEntry } from "@/lib/contest-history";

const num = (v: unknown): number | null => (v == null ? null : Number(v));

export type HistoryOptions = {
  sports: string[];
  gameTypesBySport: Record<string, string[]>;
};

export async function historyEntries(sport?: string): Promise<{
  entries: HistoryEntry[];
  options: HistoryOptions;
}> {
  const filterSport = sport && sport !== "all" ? sport : null;
  const [rows, optRows] = await Promise.all([
    filterSport
      ? sql()`
          select contest_time, sport, game_type, entry_name, place, points::float8 as points,
                 winnings_cash::float8 as winnings_cash, winnings_ticket::float8 as winnings_ticket,
                 contest_entries, entry_fee::float8 as entry_fee, places_paid
          from raw.dk_entry_history
          where sport = ${filterSport}
          order by contest_time desc nulls last, entry_key desc`
      : sql()`
          select contest_time, sport, game_type, entry_name, place, points::float8 as points,
                 winnings_cash::float8 as winnings_cash, winnings_ticket::float8 as winnings_ticket,
                 contest_entries, entry_fee::float8 as entry_fee, places_paid
          from raw.dk_entry_history
          order by contest_time desc nulls last, entry_key desc`,
    sql()`
      select sport, game_type, count(*)::int as n
      from raw.dk_entry_history
      group by sport, game_type
      order by sport, n desc, game_type`,
  ]);

  const sportsSet = new Set<string>();
  const gameTypesBySport: Record<string, string[]> = {};
  for (const r of optRows) {
    const s = String(r.sport);
    const gt = String(r.game_type);
    sportsSet.add(s);
    const list = gameTypesBySport[s] ?? [];
    if (!list.includes(gt)) list.push(gt);
    gameTypesBySport[s] = list;
  }

  const entries: HistoryEntry[] = rows.map((r) => ({
    contestTime:
      r.contest_time instanceof Date
        ? r.contest_time.toISOString()
        : r.contest_time != null
          ? String(r.contest_time)
          : null,
    sport: String(r.sport),
    gameType: String(r.game_type),
    entryName: String(r.entry_name),
    place: num(r.place),
    points: num(r.points),
    winningsCash: Number(r.winnings_cash ?? 0),
    winningsTicket: Number(r.winnings_ticket ?? 0),
    contestEntries: num(r.contest_entries),
    entryFee: num(r.entry_fee),
    placesPaid: num(r.places_paid),
  }));

  return {
    entries,
    options: {
      sports: [...sportsSet],
      gameTypesBySport,
    },
  };
}
