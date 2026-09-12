import { shortStamp } from "@/lib/format";
import type { FailedCheck, GameChecks } from "@/lib/types";

export function atRunLabel(createdAt: string | Date): string {
  return `at run ${shortStamp(createdAt)}`;
}

export function formatFailedGame(away: string, home: string, row: FailedCheck): string {
  const val = row.value == null ? "—" : row.value.toFixed(1);
  const lim = row.threshold == null ? "—" : row.threshold.toFixed(1);
  return `${away}@${home} ${val} (limit ${lim})`;
}

export function formatFailedLine(away: string, home: string, row: FailedCheck, runAt: string | Date): string {
  return `${formatFailedGame(away, home, row)} · ${atRunLabel(runAt)}`;
}

export function formatGapCaption(row: FailedCheck, runAt: string | Date): string {
  const kind = row.check_name.includes("total") ? "total" : "spread";
  const val = row.value == null ? "—" : row.value.toFixed(1);
  const lim = row.threshold == null ? "—" : row.threshold.toFixed(1);
  return `${kind} ${val} from market ${atRunLabel(runAt)} (limit ${lim})`;
}

export function marketGapCaptions(checks: GameChecks | undefined, runAt: string | Date): string[] {
  return (checks?.failedRows ?? [])
    .filter((r) => r.check_name === "spread_gap_vs_market" || r.check_name === "total_gap_vs_market")
    .map((r) => formatGapCaption(r, runAt));
}

export type FailedCheckItem = {
  game_id: string;
  away: string;
  home: string;
  row: FailedCheck;
};

export type FailedCheckGroup = {
  check_name: string;
  severity: string;
  items: FailedCheckItem[];
};

/** Failed rows across the slate: invariants first, then warnings; |value| desc within a check. */
export function groupFailedChecks(
  checks: Record<string, GameChecks>,
  games: { game_id: string; away: string; home: string }[],
): FailedCheckGroup[] {
  const gameOf = Object.fromEntries(games.map((g) => [g.game_id, g]));
  const byName = new Map<string, FailedCheckGroup>();
  for (const [game_id, c] of Object.entries(checks)) {
    const g = gameOf[game_id];
    if (!g) continue;
    for (const row of c.failedRows) {
      const cur = byName.get(row.check_name) ?? { check_name: row.check_name, severity: row.severity, items: [] };
      if (row.severity === "invariant") cur.severity = "invariant";
      cur.items.push({ game_id, away: g.away, home: g.home, row });
      byName.set(row.check_name, cur);
    }
  }
  const groups = [...byName.values()];
  for (const g of groups) {
    g.items.sort((a, b) => Math.abs(b.row.value ?? 0) - Math.abs(a.row.value ?? 0));
  }
  groups.sort((a, b) => {
    const d = Number(b.severity === "invariant") - Number(a.severity === "invariant");
    if (d !== 0) return d;
    return a.check_name.localeCompare(b.check_name);
  });
  return groups;
}
