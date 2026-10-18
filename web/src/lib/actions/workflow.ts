"use server";

/**
 * /workflow writes. Server-only env (Vercel project env, never NEXT_PUBLIC_):
 * - WORKFLOW_PASSWORD: the page's gate (the site has no other auth).
 * - GITHUB_DISPATCH_TOKEN: fine-grained token, this repo only, Actions read/write.
 * - SUPABASE_URL + SUPABASE_SERVICE_KEY: salary uploads to the private `salary-files` bucket.
 * Long work never runs here: triggerPhase only asks GitHub to start phase.yml.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { CURRENT_SEASON } from "@/lib/config";
import { dispatchInputs, looksLikeDkSalaries, salaryFileName, type DispatchRequest } from "@/lib/workflow";

const COOKIE = "nfl-edge.workflow";
const REPO = "jrakestr/nfl-edge";
const WORKFLOW_FILE = "phase.yml";
const MAX_CSV_BYTES = 2_000_000;

type Result = { ok: true; message: string } | { ok: false; error: string };

function token(password: string): string {
  return createHash("sha256").update(`nfl-edge/workflow/${password}`).digest("hex");
}

function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

/** True when the visitor holds the gate cookie. Used by the page and every action. */
export async function workflowUnlocked(): Promise<boolean> {
  const password = process.env.WORKFLOW_PASSWORD;
  if (!password) return false;
  const held = (await cookies()).get(COOKIE)?.value ?? "";
  return sameHex(held, token(password));
}

export async function unlockWorkflow(password: string): Promise<Result> {
  const expected = process.env.WORKFLOW_PASSWORD;
  if (!expected) return { ok: false, error: "WORKFLOW_PASSWORD is not set on the server" };
  if (!sameHex(token(password), token(expected))) return { ok: false, error: "Wrong password" };
  (await cookies()).set(COOKIE, token(expected), {
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/workflow",
    maxAge: 60 * 60 * 24 * 30,
  });
  revalidatePath("/workflow");
  return { ok: true, message: "Unlocked" };
}

export async function triggerPhase(req: DispatchRequest): Promise<Result> {
  if (!(await workflowUnlocked())) return { ok: false, error: "Locked: enter the workflow password" };
  const gh = process.env.GITHUB_DISPATCH_TOKEN;
  if (!gh) return { ok: false, error: "GITHUB_DISPATCH_TOKEN is not set on the server" };
  const built = dispatchInputs(req);
  if (!built.ok) return built;
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${gh}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: built.inputs }),
    cache: "no-store",
  });
  if (res.status !== 204 && res.status !== 200) {
    const body = (await res.text()).slice(0, 200);
    return { ok: false, error: `GitHub refused the run (HTTP ${res.status}): ${body}` };
  }
  const what = `${built.inputs.phase}${built.inputs.run_from === "true" ? " → DFS" : ""}${built.inputs.slate ? ` ${built.inputs.slate}` : ""}`;
  return { ok: true, message: `Started ${what} on GitHub. It shows below once the runner picks it up (about 30 s).` };
}

/** Store one DK salary CSV where the cloud run reads it. Same bytes again just overwrite. */
export async function uploadSalaryFile(form: FormData): Promise<Result> {
  if (!(await workflowUnlocked())) return { ok: false, error: "Locked: enter the workflow password" };
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_KEY ?? "";
  if (!url || !key) return { ok: false, error: "SUPABASE_URL / SUPABASE_SERVICE_KEY are not set on the server" };

  const week = Number(form.get("week"));
  const slate = String(form.get("slate") ?? "").trim().toLowerCase();
  const file = form.get("file");
  if (!Number.isInteger(week) || week < 1 || week > 22) return { ok: false, error: "Pick a week" };
  if (!/^[a-z0-9_-]{1,32}$/.test(slate)) return { ok: false, error: "Slate is letters, numbers, - or _ (main, full, early…)" };
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose the DK salary CSV" };
  if (file.size > MAX_CSV_BYTES) return { ok: false, error: "That file is too large for a DK salary export" };
  const text = await file.text();
  if (!looksLikeDkSalaries(text)) return { ok: false, error: "Not a DK salary export (header does not match)" };

  const name = salaryFileName(CURRENT_SEASON, week, slate);
  const path = `${CURRENT_SEASON}/wk${String(week).padStart(2, "0")}/${name}`;
  const headers: Record<string, string> = { apikey: key, "content-type": "text/csv", "x-upsert": "true" };
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(`${url}/storage/v1/object/salary-files/${path}`, {
    method: "POST",
    headers,
    body: text,
    cache: "no-store",
  });
  if (!res.ok) return { ok: false, error: `Storage refused the file (HTTP ${res.status})` };
  const digest = createHash("sha256").update(text).digest("hex").slice(0, 12);
  const rows = text.split(/\r?\n/).filter((l) => l.trim()).length - 1;
  return { ok: true, message: `Saved ${name}: ${rows} players, sha256 ${digest}. Run Salaries next.` };
}
