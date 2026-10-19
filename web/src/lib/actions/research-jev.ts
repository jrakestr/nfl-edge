"use server";

import { revalidatePath } from "next/cache";
import { CURRENT_SEASON } from "@/lib/config";
import { sql } from "@/lib/db";
import { jevCached, researchBuild, researchMetrics } from "@/lib/queries/research";
import {
  JEV_MODEL,
  JEV_MAX_PLAYERS,
  getJevScorer,
  metricHash,
  planRun,
  type CostEstimate,
} from "@/lib/research/jev";
import { scorePlayers, type LabPlayer, type Metric } from "@/lib/research/score";

export type JevPlan = { players: number; cached: number; toCall: number; tokens: number; usd: number };
export type JevPlanResult = ({ ok: true } & JevPlan) | { ok: false; error: string };
export type JevRunResult = ({ ok: true; written: number } & JevPlan) | { ok: false; error: string };

type Input = { week: number; metricId: string; limit: number };

/**
 * Display-only Jev run (docs/agents/data-sources.md gate): reads model.research_fields and
 * model.research_metrics, writes only model.research_jev_scores. No sim or prior input.
 */
async function prepare(input: Input) {
  if (!Number.isInteger(input.week) || input.week < 1) return { ok: false, error: "Unknown week." } as const;
  const build = await researchBuild(CURRENT_SEASON, input.week);
  if (!build) return { ok: false, error: `No research data for week ${input.week}.` } as const;
  const metric: Metric | undefined = (await researchMetrics()).find((m) => m.id === input.metricId);
  if (!metric) return { ok: false, error: "Unknown metric." } as const;
  const { rows, metricErrors } = scorePlayers(build.players, [metric], build.fields);
  if (metricErrors[metric.id]) return { ok: false, error: `Metric is not scorable: ${metricErrors[metric.id]!.join(" ")}` } as const;
  // Best user-score first; players the metric cannot score are never sent (fail closed: no guessed state).
  const candidates: LabPlayer[] = rows
    .filter((r) => r.scores[metric.id]?.value != null)
    .sort((a, b) => b.scores[metric.id]!.value! - a.scores[metric.id]!.value!)
    .map(({ playerId, name, team, position, fields }) => ({ playerId, name, team, position, fields }));
  if (candidates.length === 0) return { ok: false, error: "No player has every field this metric needs." } as const;
  const hash = metricHash(metric);
  const cached = (await jevCached(CURRENT_SEASON, input.week, JEV_MODEL, [hash]))[hash] ?? {};
  const plan = planRun({ candidates, cachedIds: new Set(Object.keys(cached)), metric, limit: input.limit });
  return { ok: true, metric, hash, plan } as const;
}

function summarize(planned: { toScore: LabPlayer[]; cached: number; estimate: CostEstimate }): JevPlan {
  return {
    players: planned.toScore.length + planned.cached,
    cached: planned.cached,
    toCall: planned.toScore.length,
    tokens: planned.estimate.tokens,
    usd: planned.estimate.usd,
  };
}

/** Cost estimate only. Makes no Jev call. */
export async function estimateJevRun(input: Input): Promise<JevPlanResult> {
  if (input.limit > JEV_MAX_PLAYERS) return { ok: false, error: `Player limit is capped at ${JEV_MAX_PLAYERS}.` };
  const p = await prepare(input);
  if (!p.ok) return { ok: false, error: p.error };
  if (!p.plan.ok) return { ok: false, error: p.plan.error ?? "Could not plan the run." };
  return { ok: true, ...summarize(p.plan) };
}

/** Score the uncached players. All or nothing: any API or parse error writes nothing. */
export async function runJev(input: Input): Promise<JevRunResult> {
  const scorer = getJevScorer();
  if (!scorer) return { ok: false, error: "Jev is not configured: TYPESAFE is not set." };
  const p = await prepare(input);
  if (!p.ok) return { ok: false, error: p.error };
  if (!p.plan.ok) return { ok: false, error: p.plan.error ?? "Could not plan the run." };
  const summary = summarize(p.plan);
  if (p.plan.toScore.length === 0) return { ok: true, written: 0, ...summary };
  let results;
  try {
    results = await scorer.score(p.plan.toScore, p.metric);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return { ok: false, error: `Jev run failed, nothing saved: ${msg}` };
  }
  await sql().begin(async (tx) => {
    for (const r of results) {
      await tx`
        insert into model.research_jev_scores (season, week, metric_hash, model, player_id, score, answers)
        values (${CURRENT_SEASON}, ${input.week}, ${p.hash}, ${JEV_MODEL}, ${r.playerId}, ${r.score},
                ${tx.json(r.answers)})
        on conflict do nothing`;
    }
  });
  revalidatePath("/research");
  return { ok: true, written: results.length, ...summary };
}
