/**
 * Research Lab scoring engine. Pure: players + metrics in, scores out. No I/O, no clock.
 *
 * A metric is a name, a list of {field, weight} terms and a normalization:
 *   none    value = Σ weight × field
 *   zscore  value = Σ weight × (field − mean) / sd, mean and sd over the same position
 *           (population sd; sd 0 gives z 0; fewer than 2 players with the field gives no score)
 *
 * Fail closed. A player missing any field a metric uses gets a null score and the names of the
 * missing fields; nothing is imputed. A metric that names an unknown field or has bad weights is
 * reported in `metricErrors` and scores nobody.
 */
import { fieldLabel } from "@/lib/research/fields";

export type Normalize = "none" | "zscore";
export type Term = { field: string; weight: number };
export type Metric = { id: string; name: string; terms: Term[]; normalize: Normalize };
export type MetricInput = { name: string; terms: Term[]; normalize: Normalize };

export type FieldValues = Record<string, number | null>;
export type LabPlayer = {
  playerId: string;
  name: string;
  team: string;
  position: string;
  /** This week's opponent, when the schedule has it. */
  opponent?: string | null;
  fields: FieldValues;
};

export type MetricScore = {
  value: number | null;
  /** Field labels this player lacks, for metrics that could not score him. */
  missing: string[];
  rank: number | null;
  positionRank: number | null;
};

export type ScoredPlayer = LabPlayer & { scores: Record<string, MetricScore> };

export type ScoreResult = {
  rows: ScoredPlayer[];
  /** Metric id → reasons it did not score. Those metrics have no values for anyone. */
  metricErrors: Record<string, string[]>;
};

export const NAME_MAX = 40;

export function validateMetric(input: MetricInput, available: readonly string[]): string[] {
  const errors: string[] = [];
  const name = input.name.trim();
  if (!name) errors.push("Name is required.");
  else if (name.length > NAME_MAX) errors.push(`Name is over ${NAME_MAX} characters.`);
  if (input.normalize !== "none" && input.normalize !== "zscore") errors.push("Pick raw or z-score.");
  if (input.terms.length === 0) errors.push("Add at least one field.");
  const seen = new Set<string>();
  for (const t of input.terms) {
    if (!available.includes(t.field)) errors.push(`${fieldLabel(t.field)} is not in this week's data.`);
    if (seen.has(t.field)) errors.push(`${fieldLabel(t.field)} appears twice.`);
    seen.add(t.field);
    if (!Number.isFinite(t.weight)) errors.push(`${fieldLabel(t.field)} needs a numeric weight.`);
    else if (t.weight === 0) errors.push(`${fieldLabel(t.field)} has weight 0; remove it.`);
  }
  return errors;
}

type Stat = { mean: number; sd: number; n: number };

/** Per (position, field) mean and population sd over players that have the field. */
function positionStats(players: LabPlayer[], fields: string[]): Map<string, Stat> {
  const acc = new Map<string, number[]>();
  for (const p of players) {
    for (const f of fields) {
      const v = p.fields[f];
      if (v == null || !Number.isFinite(v)) continue;
      const key = `${p.position}|${f}`;
      const list = acc.get(key);
      if (list) list.push(v);
      else acc.set(key, [v]);
    }
  }
  const out = new Map<string, Stat>();
  for (const [key, xs] of acc) {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
    out.set(key, { mean, sd: Math.sqrt(variance), n: xs.length });
  }
  return out;
}

/** 1-based competition rank, highest value first; ties share a rank. */
function rankDesc(values: { key: string; value: number }[]): Map<string, number> {
  const sorted = [...values].sort((a, b) => b.value - a.value);
  const out = new Map<string, number>();
  let rank = 0;
  let prev: number | null = null;
  sorted.forEach((v, i) => {
    if (prev === null || v.value !== prev) rank = i + 1;
    out.set(v.key, rank);
    prev = v.value;
  });
  return out;
}

function scoreOne(metric: Metric, players: LabPlayer[]): Map<string, MetricScore> {
  const stats = metric.normalize === "zscore" ? positionStats(players, metric.terms.map((t) => t.field)) : null;
  const out = new Map<string, MetricScore>();
  for (const p of players) {
    const missing: string[] = [];
    let total = 0;
    for (const t of metric.terms) {
      const v = p.fields[t.field];
      if (v == null || !Number.isFinite(v)) {
        missing.push(fieldLabel(t.field));
        continue;
      }
      if (!stats) {
        total += t.weight * v;
        continue;
      }
      const s = stats.get(`${p.position}|${t.field}`);
      if (!s || s.n < 2) {
        missing.push(`${fieldLabel(t.field)} (too few ${p.position}s)`);
        continue;
      }
      total += t.weight * (s.sd === 0 ? 0 : (v - s.mean) / s.sd);
    }
    out.set(p.playerId, {
      value: missing.length ? null : total,
      missing,
      rank: null,
      positionRank: null,
    });
  }
  const scored = players.filter((p) => out.get(p.playerId)!.value != null);
  const overall = rankDesc(scored.map((p) => ({ key: p.playerId, value: out.get(p.playerId)!.value! })));
  for (const pos of new Set(scored.map((p) => p.position))) {
    const inPos = scored.filter((p) => p.position === pos);
    const ranks = rankDesc(inPos.map((p) => ({ key: p.playerId, value: out.get(p.playerId)!.value! })));
    for (const p of inPos) out.get(p.playerId)!.positionRank = ranks.get(p.playerId)!;
  }
  for (const p of scored) out.get(p.playerId)!.rank = overall.get(p.playerId)!;
  return out;
}

export function scorePlayers(
  players: LabPlayer[],
  metrics: Metric[],
  available: readonly string[],
): ScoreResult {
  const metricErrors: Record<string, string[]> = {};
  const valid: Metric[] = [];
  for (const m of metrics) {
    const errs = validateMetric(m, available);
    if (errs.length) metricErrors[m.id] = errs;
    else valid.push(m);
  }
  const perMetric = new Map(valid.map((m) => [m.id, scoreOne(m, players)]));
  const rows = players.map((p) => {
    const scores: Record<string, MetricScore> = {};
    for (const [id, byPlayer] of perMetric) scores[id] = byPlayer.get(p.playerId)!;
    return { ...p, scores };
  });
  return { rows, metricErrors };
}
