import { sql } from "@/lib/db";
import { GameChecksSchema, type CheckStatusValue, type GameChecks } from "@/lib/types";

type RawCheck = {
  game_id: string | null;
  check_name: string;
  severity: string; // 'invariant' | 'warning'
  passed: boolean;
};

/** Same rule as outputs/lines.py::game_status: any failed invariant → fail; any failed warning → warn. */
export function statusFor(rows: RawCheck[]): { status: CheckStatusValue; failed: string[] } {
  const failedRows = rows.filter((r) => !r.passed);
  const inv = failedRows.filter((r) => r.severity === "invariant").map((r) => r.check_name);
  const warn = failedRows.filter((r) => r.severity !== "invariant").map((r) => r.check_name);
  const failed = [...new Set([...inv, ...warn])];
  if (inv.length) return { status: "fail", failed };
  if (warn.length) return { status: "warn", failed };
  return { status: "ok", failed };
}

/** Per-game check status for a run, keyed by game_id. Games with no check rows are `ok`. */
export async function checksForRun(runId: string): Promise<Map<string, GameChecks>> {
  const rows = (await sql()`
    select game_id, check_name, severity, passed
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
    const { status, failed } = statusFor(list);
    out.set(
      game_id,
      GameChecksSchema.parse({
        game_id,
        status,
        failed,
        invariants: list.filter((r) => r.severity === "invariant").length,
        warnings: list.filter((r) => r.severity !== "invariant").length,
      }),
    );
  }
  return out;
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
