/**
 * Jev rubric scorer for the Research Lab. TypeSafe's Jev (System One) answers typed questions
 * against a state. DISPLAY ONLY (docs/agents/data-sources.md gate): results are shown on /research
 * and cached in model.research_jev_scores; they never reach the sim, priors or any model table.
 *
 * Shape (docs.typesafe.ai): one call per player = `state` (that player's as-of fields) + one Score
 * question per metric term, each atomic ("how strong is this player's Target share for a WR?").
 * Questions are evaluated independently; the user's weights are applied here, in code.
 *
 * Key: env `TYPESAFE`, falling back to `TYPESAFE_API_KEY`. The value is never logged, returned or
 * placed in an error message. Loading the page never calls Jev; only an explicit run does.
 */
import { createHash } from "node:crypto";
import { fieldLabel } from "@/lib/research/fields";
import type { LabPlayer, Metric } from "@/lib/research/score";

export const JEV_URL = "https://api.typesafe.ai/v1/systemone";
/** Moving alias, as requested. The cache key includes this string, so a model bump needs a manual rerun. */
export const JEV_MODEL = "jev-latest";
/** $ per input token ($0.042 per million). */
export const JEV_USD_PER_TOKEN = 0.042 / 1_000_000;
export const JEV_MAX_RUN_USD = 0.5;
export const JEV_MAX_PLAYERS = 100;
const CONCURRENCY = 6;
const RUBRIC_VERSION = "v1";

export type RubricStatus = { configured: true } | { configured: false; reason: string };
export type Env = Record<string, string | undefined>;

export const JEV_ENV_VARS = ["TYPESAFE", "TYPESAFE_API_KEY"] as const;

/** First non-empty of TYPESAFE, TYPESAFE_API_KEY. */
export function jevKey(env: Env = process.env): string | null {
  for (const name of JEV_ENV_VARS) {
    const v = env[name]?.trim();
    if (v) return v;
  }
  return null;
}

export function jevStatus(env: Env = process.env): RubricStatus {
  return jevKey(env) ? { configured: true } : { configured: false, reason: "TYPESAFE is not set" };
}

export class JevNotConfigured extends Error {
  constructor() {
    super("Jev is not configured: TYPESAFE is not set.");
    this.name = "JevNotConfigured";
  }
}

// ---------- questions ----------

export type ScoreQuestion = { type: "score"; instructions: string; criteria: string[] };
export type JevRequest = {
  model: string;
  state: Record<string, unknown>;
  questions: Record<string, ScoreQuestion>;
};

/** Ordered low to high; positions 0..4. */
export function levelsFor(position: string): string[] {
  return [
    `Very low for a ${position}; bottom of the league`,
    `Below typical for a ${position}`,
    `Typical for a ${position}`,
    `Above typical for a ${position}`,
    `Elite for a ${position}; top of the league`,
  ];
}
export const JEV_LEVELS = 5;

/** One atomic Score question per metric term, keyed by field name (the id is never sent to the model). */
export function metricQuestions(metric: Metric, position: string): Record<string, ScoreQuestion> {
  const out: Record<string, ScoreQuestion> = {};
  for (const t of metric.terms) {
    out[t.field] = {
      type: "score",
      instructions: `Using only the as-of fields in the state, how strong is this player's "${fieldLabel(t.field)}" for a ${position}?`,
      criteria: levelsFor(position),
    };
  }
  return out;
}

/** Labeled as-of fields only (the same values scored in Python as-of). Nulls stay null. */
export function playerState(player: LabPlayer): Record<string, unknown> {
  const fields: Record<string, number | null> = {};
  for (const [key, value] of Object.entries(player.fields)) fields[fieldLabel(key)] = value;
  return { player: player.name, team: player.team, position: player.position, fields };
}

export function buildJevRequest(player: LabPlayer, metric: Metric, model: string = JEV_MODEL): JevRequest {
  return { model, state: playerState(player), questions: metricQuestions(metric, player.position) };
}

/** Fingerprint of what Jev is asked: term fields, weights, rubric text. Not the metric's name or id. */
export function metricHash(metric: Metric): string {
  const terms = [...metric.terms]
    .sort((a, b) => a.field.localeCompare(b.field))
    .map((t) => [t.field, t.weight]);
  const payload = JSON.stringify({ v: RUBRIC_VERSION, terms, levels: levelsFor("{pos}") });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

// ---------- parsing and combining ----------

export type TermAnswer = { score: number; confidence: number | null };

/** answers[field] → {score, confidence}. A missing, non-numeric or off-scale answer throws; no default. */
export function parseJevAnswers(json: unknown, fields: readonly string[]): Record<string, TermAnswer> {
  const answers = (json as { answers?: Record<string, Record<string, unknown> | undefined> } | null)?.answers;
  if (!answers || typeof answers !== "object") throw new Error("Jev response has no answers.");
  const out: Record<string, TermAnswer> = {};
  for (const f of fields) {
    const a = answers[f];
    if (!a || typeof a.score !== "number" || !Number.isFinite(a.score)) {
      throw new Error(`Jev response has no score for ${fieldLabel(f)}.`);
    }
    if (a.score < 0 || a.score > JEV_LEVELS - 1) {
      throw new Error(`Jev score ${a.score} for ${fieldLabel(f)} is outside the ${JEV_LEVELS}-level rubric.`);
    }
    out[f] = { score: a.score, confidence: typeof a.confidence === "number" ? a.confidence : null };
  }
  return out;
}

/** User-weighted combination: Σ weight × score ÷ Σ |weight|. Position 0..4 for positive weights. */
export function combineJev(metric: Metric, answers: Record<string, TermAnswer>): number {
  let num = 0;
  let den = 0;
  for (const t of metric.terms) {
    const a = answers[t.field];
    if (!a) throw new Error(`No Jev answer for ${fieldLabel(t.field)}.`);
    num += t.weight * a.score;
    den += Math.abs(t.weight);
  }
  if (den === 0) throw new Error("Metric weights sum to zero.");
  return num / den;
}

// ---------- cost ----------

export type CostEstimate = { requests: number; tokens: number; usd: number };

/** Fixed server-side prompt overhead per request, in tokens. */
const OVERHEAD_TOKENS = 300;
const OUTPUT_TOKENS_PER_QUESTION = 20;

/**
 * Deliberate over-estimate: body characters ÷ 2 + fixed overhead + a few output tokens per
 * question. Calibrated on the one smoke call (1 question: 745 input + 18 output tokens billed;
 * body ÷ 4 had said 248). Billed at the single $/token rate.
 */
export function estimateCost(requests: JevRequest[]): CostEstimate {
  const tokens = requests.reduce(
    (n, r) =>
      n +
      Math.ceil(JSON.stringify(r).length / 2) +
      OVERHEAD_TOKENS +
      OUTPUT_TOKENS_PER_QUESTION * Object.keys(r.questions).length,
    0,
  );
  return { requests: requests.length, tokens, usd: tokens * JEV_USD_PER_TOKEN };
}

export type RunPlan =
  | { ok: true; toScore: LabPlayer[]; cached: number; estimate: CostEstimate }
  | { ok: false; error: string };

/**
 * Pick the run: `candidates` (already ordered best first, already filtered to players whose user
 * score exists), capped at `limit`; cached players are free. Aborts over the cost ceiling.
 */
export function planRun(opts: {
  candidates: LabPlayer[];
  cachedIds: ReadonlySet<string>;
  metric: Metric;
  limit: number;
  model?: string;
  maxUsd?: number;
}): RunPlan {
  const { candidates, cachedIds, metric } = opts;
  if (!Number.isInteger(opts.limit) || opts.limit < 1) return { ok: false, error: "Player limit must be at least 1." };
  if (opts.limit > JEV_MAX_PLAYERS) return { ok: false, error: `Player limit is capped at ${JEV_MAX_PLAYERS}.` };
  const chosen = candidates.slice(0, opts.limit);
  const toScore = chosen.filter((p) => !cachedIds.has(p.playerId));
  const estimate = estimateCost(toScore.map((p) => buildJevRequest(p, metric, opts.model)));
  const max = opts.maxUsd ?? JEV_MAX_RUN_USD;
  if (estimate.usd > max) {
    return { ok: false, error: `Estimated $${estimate.usd.toFixed(4)} is over the $${max.toFixed(2)} limit. Run aborted.` };
  }
  return { ok: true, toScore, cached: chosen.length - toScore.length, estimate };
}

// ---------- client ----------

export type JevPlayerResult = { playerId: string; score: number; answers: Record<string, TermAnswer> };

/** The pluggable seam: any rubric scorer that can report status and score players on a metric. */
export interface RubricScorer {
  readonly id: string;
  status(): RubricStatus;
  /** All players or an error. Never a partial list. */
  score(players: LabPlayer[], metric: Metric): Promise<JevPlayerResult[]>;
}

export function createJevScorer(opts: { apiKey?: string | null; fetchImpl?: typeof fetch; model?: string }): RubricScorer {
  const apiKey = opts.apiKey?.trim() || null;
  const doFetch = opts.fetchImpl ?? fetch;
  const model = opts.model ?? JEV_MODEL;
  const fields = (metric: Metric) => metric.terms.map((t) => t.field);

  async function one(player: LabPlayer, metric: Metric): Promise<JevPlayerResult> {
    const res = await doFetch(JEV_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(buildJevRequest(player, metric, model)),
    });
    if (!res.ok) throw new Error(`Jev request failed with HTTP ${res.status}.`);
    const answers = parseJevAnswers(await res.json(), fields(metric));
    return { playerId: player.playerId, score: combineJev(metric, answers), answers };
  }

  return {
    id: "jev",
    status: () => (apiKey ? { configured: true } : { configured: false, reason: "TYPESAFE is not set" }),
    async score(players, metric) {
      if (!apiKey) throw new JevNotConfigured();
      const out: JevPlayerResult[] = new Array(players.length);
      let next = 0;
      let failure: unknown = null;
      async function worker() {
        while (failure === null) {
          const i = next++;
          if (i >= players.length) return;
          try {
            out[i] = await one(players[i]!, metric);
          } catch (e) {
            failure ??= e;
            return;
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, players.length) }, worker));
      if (failure !== null) throw failure;
      return out;
    },
  };
}

/** Server-side factory: null while no key is set. */
export function getJevScorer(env: Env = process.env): RubricScorer | null {
  const key = jevKey(env);
  return key ? createJevScorer({ apiKey: key }) : null;
}
