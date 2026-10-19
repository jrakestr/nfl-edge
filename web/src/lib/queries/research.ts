import { sql } from "@/lib/db";
import type { LabPlayer, Metric, Normalize, Term } from "@/lib/research/score";

export type ResearchBuild = {
  players: LabPlayer[];
  /** Field keys present on the build, in a stable order. */
  fields: string[];
  builtAt: string | null;
};

/** Weeks with a complete research build for the season, ascending. */
export async function researchWeeks(season: number): Promise<number[]> {
  const rows = await sql()`
    select distinct week from model.research_fields where season = ${season} order by week`;
  return rows.map((r) => Number(r.week));
}

/** As-of player fields for one target week (built from weeks before it). Null when not built. */
export async function researchBuild(season: number, week: number): Promise<ResearchBuild | null> {
  const rows = await sql()`
    select player_id, full_name, team, position, fields, built_at
    from model.research_fields
    where season = ${season} and week = ${week}
    order by team, position, full_name`;
  if (rows.length === 0) return null;
  const keys = new Set<string>();
  let builtAt: string | null = null;
  const players = rows.map((r) => {
    const raw = (r.fields ?? {}) as Record<string, unknown>;
    const fields: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(raw)) {
      keys.add(k);
      fields[k] = typeof v === "number" && Number.isFinite(v) ? v : null;
    }
    const at = r.built_at instanceof Date ? r.built_at.toISOString() : r.built_at ? String(r.built_at) : null;
    if (at && (!builtAt || at > builtAt)) builtAt = at;
    return {
      playerId: String(r.player_id),
      name: String(r.full_name),
      team: String(r.team),
      position: String(r.position),
      fields,
    };
  });
  return { players, fields: [...keys].sort(), builtAt };
}

function parseTerms(raw: unknown): Term[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((t) => {
    const o = t as { field?: unknown; weight?: unknown } | null;
    return typeof o?.field === "string" && typeof o.weight === "number"
      ? [{ field: o.field, weight: o.weight }]
      : [];
  });
}

export async function researchMetrics(): Promise<Metric[]> {
  const rows = await sql()`
    select id, name, terms, normalize from model.research_metrics order by id`;
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    terms: parseTerms(r.terms),
    normalize: (r.normalize === "zscore" ? "zscore" : "none") as Normalize,
  }));
}

/** Cached Jev scores for one week: metric hash → player id → combined score. Free to read. */
export async function jevCached(
  season: number,
  week: number,
  model: string,
  hashes: string[],
): Promise<Record<string, Record<string, number>>> {
  const out: Record<string, Record<string, number>> = {};
  if (hashes.length === 0) return out;
  const rows = await sql()`
    select metric_hash, player_id, score::float8 as score
    from model.research_jev_scores
    where season = ${season} and week = ${week} and model = ${model} and metric_hash in ${sql()(hashes)}`;
  for (const r of rows) (out[String(r.metric_hash)] ??= {})[String(r.player_id)] = Number(r.score);
  return out;
}
