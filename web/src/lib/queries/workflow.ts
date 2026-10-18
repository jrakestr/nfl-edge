import { sql } from "@/lib/db";
import type { RunStatus, WorkflowRun } from "@/lib/workflow";

/** ops.workflow_runs for one week, newest first. Written by `nfl-edge phase` (Mac or Actions). */
export async function workflowRuns(season: number, week: number, limit = 60): Promise<WorkflowRun[]> {
  const rows = await sql()`
    select id::int as id, phase, week, slate, status, started_at, finished_at, message, host, gh_run_url
    from ops.workflow_runs
    where season = ${season} and week = ${week}
    order by started_at desc
    limit ${limit}`;
  return rows.map((r) => ({
    id: Number(r.id),
    phase: String(r.phase),
    week: Number(r.week),
    slate: r.slate ?? null,
    status: r.status as RunStatus,
    started_at: new Date(r.started_at).toISOString(),
    finished_at: r.finished_at ? new Date(r.finished_at).toISOString() : null,
    message: r.message ?? null,
    host: r.host ?? null,
    gh_run_url: r.gh_run_url ?? null,
  }));
}

export type ChangeCheck = {
  checked_at: string;
  suggest_resim: boolean;
  reasons: { player?: string; team?: string; source?: string; before?: string; after?: string }[];
  n_info: number;
};

/** Newest change check of the week: what moved since the newest complete sim. */
export async function latestChangeCheck(season: number, week: number): Promise<ChangeCheck | null> {
  const rows = await sql()`
    select checked_at, suggest_resim, reasons, info
    from ops.change_checks
    where season = ${season} and week = ${week}
    order by checked_at desc
    limit 1`;
  const r = rows[0];
  if (!r) return null;
  return {
    checked_at: new Date(r.checked_at).toISOString(),
    suggest_resim: Boolean(r.suggest_resim),
    reasons: Array.isArray(r.reasons) ? r.reasons : [],
    n_info: Array.isArray(r.info) ? r.info.length : 0,
  };
}
