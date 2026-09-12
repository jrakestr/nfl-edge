import { sql } from "@/lib/db";
import { shortStamp } from "@/lib/format";
import { GameChecksSchema, type CheckStatusValue, type FailedCheck, type GameChecks } from "@/lib/types";

export type RawCheck = {
  game_id: string | null;
  check_name: string;
  severity: string; // 'invariant' | 'warning'
  passed: boolean;
  value: number | null;
  threshold: number | null;
  team: string | null;
};

function numOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function toFailedRow(r: RawCheck): FailedCheck {
  return {
    check_name: r.check_name,
    value: numOrNull(r.value),
    threshold: numOrNull(r.threshold),
    team: r.team ?? null,
    severity: r.severity,
  };
}

/** Same rule as outputs/lines.py::game_status: any failed invariant → fail; any failed warning → warn. */
export function statusFor(rows: RawCheck[]): {
  status: CheckStatusValue;
  failed: string[];
  failedRows: FailedCheck[];
} {
  const failedRaw = rows.filter((r) => !r.passed);
  const inv = failedRaw.filter((r) => r.severity === "invariant");
  const warn = failedRaw.filter((r) => r.severity !== "invariant");
  const ordered = [...inv, ...warn];
  const failed = [...new Set(ordered.map((r) => r.check_name))];
  const failedRows = ordered.map(toFailedRow);
  if (inv.length) return { status: "fail", failed, failedRows };
  if (warn.length) return { status: "warn", failed, failedRows };
  return { status: "ok", failed, failedRows };
}

/** Per-game check status for a run, keyed by game_id. Games with no check rows are `ok`. */
export async function checksForRun(runId: string): Promise<Map<string, GameChecks>> {
  const rows = (await sql()`
    select game_id, check_name, severity, passed,
           value::float8 as value, threshold::float8 as threshold, team
    from model.sim_checks
    where run_id = ${runId}::uuid and game_id is not null`) as unknown as RawCheck[];
  const byGame = new Map<string, RawCheck[]>();
  for (const r of rows) {
    if (!r.game_id) continue;
    const list = byGame.get(r.game_id) ?? [];
    list.push(r);
    byGame.set(r.game_id, list);
  }
  const out = new Map<string, GameChecks>();
  for (const [game_id, list] of byGame) {
    const { status, failed, failedRows } = statusFor(list);
    out.set(
      game_id,
      GameChecksSchema.parse({
        game_id,
        status,
        failed,
        failedRows,
        invariants: list.filter((r) => r.severity === "invariant").length,
        warnings: list.filter((r) => r.severity !== "invariant").length,
      }),
    );
  }
  return out;
}

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

/** Run-level roll-up for the RunBadge / header dot. */
export function runStatus(checks: Map<string, GameChecks>): CheckStatusValue {
  let s: CheckStatusValue = "ok";
  for (const c of checks.values()) {
    if (c.status === "fail") return "fail";
    if (c.status === "warn") s = "warn";
  }
  return s;
}
