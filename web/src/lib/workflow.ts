/**
 * /workflow display and input rules. SQL-free so the client component can import it.
 * The phases and their order mirror src/nfl_edge/workflow.py (PHASES + refresh).
 */

export const PHASES = [
  { key: "refresh", label: "Refresh", detail: "Lines, scores, injury status, grade finished weeks, change check" },
  { key: "ingest", label: "Ingest", detail: "nflverse stats, schedules, rosters, depth charts" },
  { key: "salaries", label: "Salaries", detail: "Fetch DK salary files from DraftKings, load them and their injury tags" },
  { key: "sim", label: "Sim", detail: "Simulate every game of the week" },
  { key: "lines", label: "Lines", detail: "Odds pull, fair lines and edges from the newest sim" },
  { key: "props", label: "Props", detail: "Fair props and prop edges" },
  { key: "dfs", label: "DFS", detail: "Optimizer and GPP sim for each salary file" },
  { key: "grade", label: "Grade", detail: "Grade the week against results" },
] as const;

export type PhaseKey = (typeof PHASES)[number]["key"];

const PHASE_KEYS = new Set<string>(PHASES.map((p) => p.key));

/** "Run from here" chains through DFS; refresh and grade only run alone (workflow.chain). */
export function canRunFrom(phase: PhaseKey): boolean {
  return phase !== "refresh" && phase !== "grade";
}

export type RunStatus = "running" | "success" | "failed";

export type WorkflowRun = {
  id: number;
  phase: string;
  week: number;
  slate: string | null;
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  message: string | null;
  host: string | null;
  gh_run_url: string | null;
};

/** "48 s", "3 m 05 s", "1 h 02 m". Running rows count up to `now`. */
export function formatDuration(startedIso: string, finishedIso: string | null, now: Date = new Date()): string {
  const start = Date.parse(startedIso);
  const end = finishedIso ? Date.parse(finishedIso) : now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "—";
  const s = Math.max(0, Math.round((end - start) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} m ${String(s % 60).padStart(2, "0")} s`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} m`;
}

/** Newest run per phase (DFS: per slate too) from rows sorted newest first. */
export function latestByKey(rows: WorkflowRun[]): Map<string, WorkflowRun> {
  const out = new Map<string, WorkflowRun>();
  for (const r of rows) {
    const key = r.phase === "dfs" && r.slate ? `dfs:${r.slate}` : r.phase;
    if (!out.has(key)) out.set(key, r);
  }
  return out;
}

export function anyRunning(rows: WorkflowRun[]): boolean {
  return rows.some((r) => r.status === "running");
}

export type DispatchRequest = {
  phase: string;
  runFrom?: boolean;
  week?: number | string | null;
  slate?: string | null;
  draws?: number | string | null;
  fieldSize?: number | string | null;
  iterations?: number | string | null;
};

export type DispatchInputs = Record<string, string>;

function optInt(v: unknown, name: string, min: number, max: number): string | { error: string } {
  if (v === null || v === undefined || String(v).trim() === "") return "";
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) return { error: `${name} must be a whole number from ${min} to ${max}` };
  return String(n);
}

/** Validate a page request into phase.yml's workflow_dispatch inputs (all strings). */
export function dispatchInputs(req: DispatchRequest): { ok: true; inputs: DispatchInputs } | { ok: false; error: string } {
  if (!PHASE_KEYS.has(req.phase)) return { ok: false, error: `Unknown phase ${req.phase}` };
  const phase = req.phase as PhaseKey;
  const runFrom = Boolean(req.runFrom);
  if (runFrom && !canRunFrom(phase)) return { ok: false, error: `${phase} runs on its own` };
  const slate = (req.slate ?? "").trim();
  if (slate && !/^[a-z0-9_-]{1,32}$/.test(slate)) return { ok: false, error: "Slate is letters, numbers, - or _" };
  if (slate && phase !== "dfs") return { ok: false, error: "A slate only applies to DFS" };
  const fields = [
    ["week", optInt(req.week, "Week", 1, 22)],
    ["draws", optInt(req.draws, "Draws", 1000, 100000)],
    ["field_size", optInt(req.fieldSize, "Field size", 200, 50000)],
    ["iterations", optInt(req.iterations, "Iterations", 100, 50000)],
  ] as const;
  const inputs: DispatchInputs = { phase, run_from: runFrom ? "true" : "false", slate };
  for (const [k, v] of fields) {
    if (typeof v !== "string") return { ok: false, error: v.error };
    inputs[k] = v;
  }
  return { ok: true, inputs };
}

/** DK salary file name the pipeline expects: DKSalaries_{season}_wk{WW}_{slate}.csv */
export function salaryFileName(season: number, week: number, slate: string): string {
  return `DKSalaries_${season}_wk${String(week).padStart(2, "0")}_${slate}.csv`;
}

export const DK_CLASSIC_HEADER = "Position,Name + ID,Name,ID,Roster Position,Salary,Game Info,TeamAbbrev";

/** A DK salary export starts with this header (BOM allowed). */
export function looksLikeDkSalaries(text: string): boolean {
  const first = text.replace(/^﻿/, "").split(/\r?\n/, 1)[0] ?? "";
  return first.startsWith(DK_CLASSIC_HEADER);
}
