"use server";

/**
 * LOC page write. Starts a full `nfl-edge ingest espn-league` and returns immediately.
 * On Vercel that is a GitHub dispatch of loc.yml (GITHUB_DISPATCH_TOKEN, server env only).
 * Anywhere else it is a detached process in this repo, because the dev server has no token
 * and the pull has to hit the same database the page reads. The pull does not run in the request.
 */
import { spawn } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";
import { locDispatchInputs } from "@/lib/loc-update";

const REPO = "jrakestr/nfl-edge";
const WORKFLOW_FILE = "loc.yml";
const STARTED = "Updating LOC stats. This page refreshes when the pull finishes.";

type Result = { ok: true; message: string } | { ok: false; error: string };

function repoRoot(): string | null {
  const candidates = [process.cwd(), path.resolve(process.cwd(), "..")];
  return (
    candidates.find(
      (dir) => existsSync(path.join(dir, "pyproject.toml")) && existsSync(path.join(dir, ".venv", "bin", "python")),
    ) ?? null
  );
}

/** Local and any non-Vercel server. Season is already a four-digit year, passed as an argv, not a shell. */
function startLocal(season: string): Result {
  const root = repoRoot();
  if (!root) return { ok: false, error: "This server cannot start the LOC pull" };
  const logDir = path.join(root, "output");
  mkdirSync(logDir, { recursive: true });
  const log = openSync(path.join(logDir, "loc-button.log"), "a");
  try {
    const child = spawn(path.join(root, ".venv", "bin", "python"), ["-m", "nfl_edge", "ingest", "espn-league", "--season", season], {
      cwd: root,
      detached: true,
      stdio: ["ignore", log, log],
      env: { ...process.env, PYTHONUNBUFFERED: "1" },
    });
    child.unref();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The LOC pull did not start" };
  } finally {
    closeSync(log);
  }
  return { ok: true, message: STARTED };
}

async function startGitHub(season: string): Promise<Result> {
  const gh = process.env.GITHUB_DISPATCH_TOKEN;
  if (!gh) return { ok: false, error: "GITHUB_DISPATCH_TOKEN is not set on the server" };
  const res = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${gh}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main", inputs: { season } }),
    cache: "no-store",
  });
  if (res.status !== 204 && res.status !== 200) {
    const body = (await res.text()).slice(0, 200);
    return { ok: false, error: `GitHub refused the run (HTTP ${res.status}): ${body}` };
  }
  return { ok: true, message: STARTED };
}

export async function updateLocStats(season: number): Promise<Result> {
  const built = locDispatchInputs(season);
  if (!built.ok) return built;
  if (process.env.VERCEL) return startGitHub(built.season);
  return startLocal(built.season);
}
