"use server";

import { revalidatePath } from "next/cache";
import { CURRENT_SEASON } from "@/lib/config";
import { sql } from "@/lib/db";
import { researchBuild, researchWeeks } from "@/lib/queries/research";
import { validateMetric, type MetricInput } from "@/lib/research/score";

export type MetricResult = { ok: true } | { ok: false; error: string };

/**
 * Research Lab writes (docs/agents/web.md exception): insert or delete a row of
 * model.research_metrics. Display-only; nothing here reaches the sim or priors.
 * Fields are checked against the newest built week, so an unknown field is rejected.
 */
export async function saveResearchMetric(input: MetricInput): Promise<MetricResult> {
  const weeks = await researchWeeks(CURRENT_SEASON);
  const latest = weeks.at(-1);
  if (latest == null) return { ok: false, error: "No research data is built yet." };
  const build = await researchBuild(CURRENT_SEASON, latest);
  if (!build) return { ok: false, error: "No research data is built yet." };
  const errors = validateMetric(input, build.fields);
  if (errors.length) return { ok: false, error: errors.join(" ") };
  const name = input.name.trim();
  const terms = input.terms.map((t) => ({ field: t.field, weight: t.weight }));
  try {
    // sql.json sends a real jsonb array; a pre-stringified ::jsonb param is double-encoded to a jsonb string.
    await sql()`
      insert into model.research_metrics (name, terms, normalize)
      values (${name}, ${sql().json(terms)}, ${input.normalize})`;
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { ok: false, error: `A metric named "${name}" exists.` };
    throw e;
  }
  revalidatePath("/research");
  return { ok: true };
}

export async function deleteResearchMetric(id: number): Promise<MetricResult> {
  if (!Number.isInteger(id) || id < 1) return { ok: false, error: "Unknown metric." };
  await sql()`delete from model.research_metrics where id = ${id}`;
  revalidatePath("/research");
  return { ok: true };
}
