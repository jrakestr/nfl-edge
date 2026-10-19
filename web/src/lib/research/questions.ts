/**
 * Research Lab DFS questions. Pure and client-safe (no SQL, no node:crypto): the same functions
 * build the "What Jev sees" preview in the browser and the request the server sends, so the
 * preview is the request.
 *
 * A question is one DFS decision answered per player by Jev: a Score (1 to 5, rubric text editable)
 * or a Noul (yes/no probability). Each question carries the field list it needs; the state sent to
 * Jev for that question holds those fields only, taken from the as-of weekly build. Weights are the
 * user's and live here, in code; Jev never sees them.
 *
 * Fail closed: a question whose required fields are absent from the week's build is disabled with
 * "needs data: <what>". A player missing a required field is never sent for that question.
 */
import { fieldLabel, fieldNeeds, fieldValue } from "@/lib/research/fields";
import type { LabPlayer } from "@/lib/research/score";

export type QuestionKind = "score" | "noul";

export type QuestionSpec = {
  id: string;
  label: string;
  /** One plain-English line under the label. */
  blurb: string;
  kind: QuestionKind;
  instructions: string;
  /** Score rubric, low to high (5 entries). Empty for a Noul. */
  levels: string[];
  trueText?: string;
  falseText?: string;
  /** Fields a player must have. */
  required: string[];
  /** Fields included when present. */
  context: string[];
  /** Whether the state names his opponent. */
  opponent: boolean;
  /** Yes means avoid: the yes-probability counts against the final score. */
  inverted: boolean;
  custom: boolean;
};

export const SCORE_LEVELS = 5;
export const MAX_QUESTIONS = 12;
export const INSTRUCTIONS_MAX = 600;
export const LEVEL_MAX = 200;
export const LABEL_MAX = 30;

type Starter = Omit<QuestionSpec, "custom" | "inverted"> & { inverted?: boolean };

export const STARTER_QUESTIONS: Starter[] = [
  {
    id: "value",
    label: "Value",
    blurb: "Does he return value at his salary?",
    kind: "score",
    instructions:
      "Does this player return value at his DraftKings salary? Judge his sim projection against what the salary needs: about 3 points per $1,000 to be useful in cash games, about 5 points per $1,000 to win a tournament.",
    levels: [
      "Poor value: projection is well under 3 points per $1,000",
      "Weak value: projection is under 3 points per $1,000",
      "Fair: projection is about 3 points per $1,000, playable but no edge",
      "Good: projection is comfortably over 3 points per $1,000 and 5 is within reach",
      "Excellent: projection is well over 3 points per $1,000 and 5 is a realistic outcome",
    ],
    required: ["dk_salary", "sim_dk_mean", "sim_value_x"],
    context: ["salary_pos_rank", "sim_p_3x", "sim_p_5x"],
    opponent: false,
  },
  {
    id: "upside",
    label: "Upside",
    blurb: "Does he have a path to a slate-winning score?",
    kind: "score",
    instructions:
      "Does this player have a realistic path to a slate-winning score? Compare his big-game outcome (the 1-in-10 sim result) with his salary: a slate winner needs about 5 points per $1,000 or more.",
    levels: [
      "No path: even his big game falls well short of 5 points per $1,000",
      "Unlikely: his big game only reaches about 4 points per $1,000",
      "Possible: his big game reaches about 5 points per $1,000",
      "Strong: his big game clears 5 points per $1,000 and it happens fairly often",
      "Slate-breaking: his big game is far above 5 points per $1,000 and 5 is a common outcome",
    ],
    required: ["sim_dk_p90", "sim_dk_mean", "dk_salary"],
    context: ["sim_dk_p50", "sim_p_5x"],
    opponent: false,
  },
  {
    id: "matchup",
    label: "Matchup",
    blurb: "Is his opponent beatable at his position?",
    kind: "score",
    instructions:
      "Is this player's opponent beatable at his position? Judge how many DraftKings points the defense gives up to his position compared with the league, and how the simulator rates that defense.",
    levels: [
      "Very tough: among the stingiest defenses against his position",
      "Tough: gives up fewer points than average to his position",
      "Neutral: about league average against his position",
      "Favorable: gives up more points than average to his position",
      "Smash spot: among the most generous defenses against his position",
    ],
    required: ["opp_dk_allowed_pos", "opp_dk_allowed_pos_vs_league", "opp_dk_allowed_pos_rank", "opp_games"],
    context: ["opp_def_ppd_allowed", "opp_def_ppd_vs_league"],
    opponent: true,
  },
  {
    id: "environment",
    label: "Environment",
    blurb: "Does the game help him: total, spread, pace?",
    kind: "score",
    instructions:
      "Does the game environment help this player? Weigh the game total, his team's spread and implied points, and the pace and pass rate the simulator expects.",
    levels: [
      "Hurts: low total, a big underdog or a slow pace",
      "Slightly negative: below-average total or a game script against his role",
      "Neutral: nothing about the game helps or hurts him",
      "Helps: a good total, or his team is favored in a game that should move",
      "Ideal: high total, high implied points and a pace to match",
    ],
    required: ["team_spread", "game_total", "team_implied_total"],
    context: ["sim_team_drives", "sim_team_plays_per_drive", "sim_team_neutral_pass_rate"],
    opponent: true,
  },
  {
    id: "opportunity",
    label: "Opportunity",
    blurb: "Is his role bigger than his salary implies?",
    kind: "score",
    instructions:
      "Is this player's opportunity bigger than his salary implies? Look at the targets and carries that teammates ruled out leave open, his own share of targets and carries, and where his salary ranks at his position.",
    levels: [
      "Smaller than the salary implies: priced for a role he does not have",
      "Slightly smaller than the salary implies",
      "About what the salary implies",
      "Bigger than the salary implies: extra work is open to him",
      "Much bigger than the salary implies: a large vacated role at a modest price",
    ],
    required: ["target_share", "carry_share", "dk_salary", "teammates_out_target_share", "teammates_out_carry_share"],
    context: ["salary_pos_rank", "snap_pct_last", "snap_pct_l3", "listed_questionable", "listed_doubtful"],
    opponent: false,
  },
  {
    id: "leverage",
    label: "Leverage",
    blurb: "Good projection, but few people will own him?",
    kind: "score",
    instructions:
      "Is this a good projection that the field will mostly skip? Compare his projection and value with his projected ownership.",
    levels: [
      "No leverage: heavily owned with an ordinary projection",
      "Mildly over-owned for what he projects",
      "Neutral: ownership matches his projection",
      "Good leverage: strong projection, owned less than he should be",
      "Excellent leverage: strong projection, nearly ignored by the field",
    ],
    required: ["own_pct_est", "sim_dk_mean", "dk_salary"],
    context: ["own_pct_low", "own_pct_high", "sim_value_x", "sim_p_5x"],
    opponent: false,
  },
  {
    id: "safety",
    label: "Safety",
    blurb: "Stable role and a low chance of a dud?",
    kind: "score",
    instructions:
      "Is this player's role stable with a low chance of a bust? Judge his snap share, how many games the sample covers, and how much his scores swing from game to game.",
    levels: [
      "Very risky: shaky role, wild swings, frequent duds",
      "Risky: role or scores are unreliable",
      "Average: usable role with normal swings",
      "Safe: steady role and steady scores",
      "Rock solid: locked-in role, steady scores, rarely a dud",
    ],
    required: ["games_played", "snap_pct_l3", "dk_pts_sd", "dk_pts_season"],
    context: ["dk_pts_min", "dk_pts_l3", "snap_pct_last", "sim_dk_sd", "sim_dk_p10", "listed_questionable"],
    opponent: false,
  },
  {
    id: "fade",
    label: "Fade",
    blurb: "Yes or no: is price plus ownership too high for the edge?",
    kind: "noul",
    instructions:
      "Is this player's price plus his ownership too high for the edge he offers? Answer yes to fade him: expensive, heavily owned and projected only about what his salary demands.",
    levels: [],
    trueText:
      "Salary and ownership are both high relative to his projection and value, so the field is paying for no edge",
    falseText:
      "His projection and value justify his salary and ownership, or ownership is low enough to make him worth playing",
    required: ["dk_salary", "own_pct_est", "sim_dk_mean"],
    context: ["sim_value_x", "own_pct_low", "own_pct_high", "sim_dk_p90", "sim_p_5x"],
    opponent: false,
    inverted: true,
  },
];

export const STARTER_IDS = STARTER_QUESTIONS.map((q) => q.id);

export type PresetId = "cash" | "gpp";
export const PRESETS: Record<PresetId, { label: string; blurb: string; weights: Record<string, number> }> = {
  cash: {
    label: "Cash",
    blurb: "Double-ups and head-to-heads: reward a high floor.",
    weights: { value: 35, safety: 30, matchup: 20, environment: 15 },
  },
  gpp: {
    label: "GPP",
    blurb: "Tournaments: reward ceiling and low ownership.",
    weights: { upside: 35, leverage: 25, environment: 20, opportunity: 20 },
  },
};

/** Weights for a preset across every starter question (0 when the preset leaves it out). */
export function presetWeights(preset: PresetId): Record<string, number> {
  return Object.fromEntries(STARTER_IDS.map((id) => [id, PRESETS[preset].weights[id] ?? 0]));
}

// ---------- data groups (custom questions pick from these) ----------

export const DATA_GROUPS: Record<string, { label: string; fields: string[] }> = {
  price: { label: "Salary and price", fields: ["dk_salary", "salary_pos_rank"] },
  sim: {
    label: "Sim projection",
    fields: ["sim_dk_mean", "sim_dk_sd", "sim_dk_p10", "sim_dk_p50", "sim_dk_p90", "sim_value_x", "sim_p_3x", "sim_p_5x"],
  },
  matchup: {
    label: "Opponent defense",
    fields: [
      "opp_dk_allowed_pos",
      "opp_dk_allowed_pos_vs_league",
      "opp_dk_allowed_pos_rank",
      "opp_games",
      "opp_def_ppd_allowed",
      "opp_def_ppd_vs_league",
    ],
  },
  environment: {
    label: "Game environment",
    fields: [
      "team_spread",
      "game_total",
      "team_implied_total",
      "sim_team_drives",
      "sim_team_plays_per_drive",
      "sim_team_neutral_pass_rate",
    ],
  },
  opportunity: {
    label: "Injuries and role",
    fields: ["teammates_out_target_share", "teammates_out_carry_share", "listed_questionable", "listed_doubtful"],
  },
  ownership: { label: "Projected ownership", fields: ["own_pct_est", "own_pct_low", "own_pct_high"] },
  history: {
    label: "Usage and history",
    fields: [
      "target_share",
      "carry_share",
      "snap_pct_l3",
      "snap_pct_last",
      "games_played",
      "dk_pts_season",
      "dk_pts_l3",
      "dk_pts_sd",
      "dk_pts_min",
    ],
  },
};
export const DEFAULT_CUSTOM_GROUPS = ["price", "sim"];

export const DEFAULT_CUSTOM_LEVELS = [
  "Very poor on this question",
  "Poor on this question",
  "Average on this question",
  "Good on this question",
  "Excellent on this question",
];

// ---------- resolving what the user sent ----------

/** What the client sends per question: ids and the text the user may edit. Never field lists for built-ins. */
export type QuestionEdit = {
  id: string;
  label?: string;
  instructions: string;
  levels?: string[];
  trueText?: string;
  falseText?: string;
  /** Custom questions only: data groups to include. */
  groups?: string[];
};

export function starterSpec(id: string): QuestionSpec | null {
  const s = STARTER_QUESTIONS.find((q) => q.id === id);
  return s ? { ...s, inverted: s.inverted ?? false, custom: false } : null;
}

export function isCustomId(id: string): boolean {
  return /^custom-[a-z0-9]{1,12}$/.test(id);
}

function cleanText(s: unknown, max: number): string | null {
  if (typeof s !== "string") return null;
  const t = s.trim().replace(/\s+/g, " ");
  return t.length > 0 && t.length <= max ? t : null;
}

export function customFields(groups: readonly string[]): string[] {
  const out = new Set<string>();
  for (const g of groups) for (const f of DATA_GROUPS[g]?.fields ?? []) out.add(f);
  return [...out];
}

/**
 * Validate and resolve edits into specs. Built-ins keep their canonical fields; only the text is the user's.
 * Any invalid input is reported and nothing is resolved (fail closed).
 */
export function resolveQuestions(edits: readonly QuestionEdit[]): { specs: QuestionSpec[]; errors: string[] } {
  const errors: string[] = [];
  const specs: QuestionSpec[] = [];
  if (edits.length === 0) errors.push("Pick at least one question.");
  if (edits.length > MAX_QUESTIONS) errors.push(`Use at most ${MAX_QUESTIONS} questions.`);
  const seen = new Set<string>();
  for (const e of edits.slice(0, MAX_QUESTIONS)) {
    if (seen.has(e.id)) {
      errors.push("A question appears twice.");
      continue;
    }
    seen.add(e.id);
    const base = starterSpec(e.id);
    if (!base && !isCustomId(e.id)) {
      errors.push("Unknown question.");
      continue;
    }
    const instructions = cleanText(e.instructions, INSTRUCTIONS_MAX);
    if (!instructions) {
      errors.push(`${base?.label ?? "Custom question"}: question text must be 1 to ${INSTRUCTIONS_MAX} characters.`);
      continue;
    }
    if (base) {
      if (base.kind === "score") {
        const levels = (e.levels ?? []).map((l) => cleanText(l, LEVEL_MAX));
        if (levels.length !== SCORE_LEVELS || levels.some((l) => l === null)) {
          errors.push(`${base.label}: all ${SCORE_LEVELS} score levels need text up to ${LEVEL_MAX} characters.`);
          continue;
        }
        specs.push({ ...base, instructions, levels: levels as string[] });
      } else {
        const trueText = cleanText(e.trueText, LEVEL_MAX * 2);
        const falseText = cleanText(e.falseText, LEVEL_MAX * 2);
        if (!trueText || !falseText) {
          errors.push(`${base.label}: both the yes and no descriptions need text.`);
          continue;
        }
        specs.push({ ...base, instructions, trueText, falseText });
      }
      continue;
    }
    const label = cleanText(e.label, LABEL_MAX);
    const groups = (e.groups ?? []).filter((g) => g in DATA_GROUPS);
    const levels = (e.levels ?? DEFAULT_CUSTOM_LEVELS).map((l) => cleanText(l, LEVEL_MAX));
    if (!label) errors.push(`Custom question names must be 1 to ${LABEL_MAX} characters.`);
    else if (groups.length === 0) errors.push(`${label}: pick at least one kind of data for Jev to see.`);
    else if (levels.length !== SCORE_LEVELS || levels.some((l) => l === null)) {
      errors.push(`${label}: all ${SCORE_LEVELS} score levels need text.`);
    } else {
      specs.push({
        id: e.id,
        label,
        blurb: "Your own question.",
        kind: "score",
        instructions,
        levels: levels as string[],
        required: [],
        context: customFields(groups),
        opponent: groups.includes("matchup") || groups.includes("environment"),
        inverted: false,
        custom: true,
      });
    }
  }
  return errors.length ? { specs: [], errors } : { specs, errors };
}

// ---------- data availability ----------

export type Availability = { enabled: boolean; missing: string[]; needs: string[] };

/**
 * A question is enabled when the week's build has every required field for at least one player.
 * `available` = field keys with a non-null value for someone. Custom questions have no required
 * fields: they are enabled when at least one of their fields exists.
 */
export function availability(spec: QuestionSpec, available: ReadonlySet<string>): Availability {
  if (spec.custom) {
    const have = spec.context.some((f) => available.has(f));
    return have
      ? { enabled: true, missing: [], needs: [] }
      : { enabled: false, missing: spec.context, needs: [...new Set(spec.context.map(fieldNeeds))] };
  }
  const missing = spec.required.filter((f) => !available.has(f));
  return { enabled: missing.length === 0, missing, needs: [...new Set(missing.map(fieldNeeds))] };
}

export function needsText(a: Availability): string {
  return a.needs.length ? `needs data: ${a.needs.join("; ")}` : "";
}

// ---------- state, request body, candidates ----------

function fieldsOf(spec: QuestionSpec): string[] {
  return [...spec.required, ...spec.context.filter((f) => !spec.required.includes(f))];
}

export function hasRequired(player: LabPlayer, spec: QuestionSpec): boolean {
  if (spec.custom) return spec.context.some((f) => player.fields[f] != null);
  return spec.required.every((f) => player.fields[f] != null && Number.isFinite(player.fields[f]));
}

export type PlayerState = {
  player: string;
  team: string;
  position: string;
  opponent?: string;
  data: Record<string, number>;
};

/** The exact state sent to Jev for this player and question. Only the question's fields, nulls omitted. */
export function playerState(player: LabPlayer, spec: QuestionSpec): PlayerState {
  const data: Record<string, number> = {};
  for (const f of fieldsOf(spec)) {
    const v = fieldValue(f, player.fields[f]);
    if (v != null) data[fieldLabel(f)] = v;
  }
  const state: PlayerState = { player: player.name, team: player.team, position: player.position, data };
  if (spec.opponent && player.opponent) state.opponent = player.opponent;
  return state;
}

export type JevScoreQuestion = { type: "score"; instructions: string; criteria: string[] };
export type JevNoulQuestion = { type: "noul"; instructions: string; criteria: { true: string; false: string } };

/** The question object as the API takes it. */
export function questionBody(spec: QuestionSpec): JevScoreQuestion | JevNoulQuestion {
  return spec.kind === "score"
    ? { type: "score", instructions: spec.instructions, criteria: spec.levels }
    : { type: "noul", instructions: spec.instructions, criteria: { true: spec.trueText ?? "", false: spec.falseText ?? "" } };
}

export const POSITION_CHOICES = [
  { id: "flex", label: "RB, WR, TE", positions: ["RB", "WR", "TE"] },
  { id: "all", label: "All positions", positions: ["QB", "RB", "WR", "TE"] },
  { id: "QB", label: "QB", positions: ["QB"] },
  { id: "RB", label: "RB", positions: ["RB"] },
  { id: "WR", label: "WR", positions: ["WR"] },
  { id: "TE", label: "TE", positions: ["TE"] },
] as const;

/** Sort key for who gets scored first: sim projection, else salary. Higher first. */
function priority(p: LabPlayer): number {
  return p.fields.sim_dk_mean ?? p.fields.dk_salary ?? -1;
}

/**
 * Players to score: right position, not ruled out, has every required field of every question.
 * Best sim projection (else salary) first, capped at `limit`.
 */
export function pickCandidates(
  players: readonly LabPlayer[],
  specs: readonly QuestionSpec[],
  opts: { positions: readonly string[]; limit: number },
): LabPlayer[] {
  return players
    .filter((p) => opts.positions.includes(p.position))
    .filter((p) => p.fields.listed_out !== 1)
    .filter((p) => specs.every((s) => hasRequired(p, s)))
    .sort((a, b) => priority(b) - priority(a) || a.name.localeCompare(b.name))
    .slice(0, opts.limit);
}

// ---------- weights and final score ----------

export type Answer = { value: number; confidence: number | null };

/** Weight shares in percent over the enabled questions, summing to 100 (all 0 when nothing is weighted). */
export function weightShares(
  weights: Readonly<Record<string, number>>,
  enabledIds: readonly string[],
): Record<string, number> {
  const raw = enabledIds.map((id) => Math.max(0, Number.isFinite(weights[id]) ? weights[id]! : 0));
  const total = raw.reduce((a, b) => a + b, 0);
  return Object.fromEntries(enabledIds.map((id, i) => [id, total > 0 ? (raw[i]! / total) * 100 : 0]));
}

/** Contribution on a 1 to 5 scale: Score value + 1; a Noul counts against him: 5 at "no", 1 at "yes". */
export function contribution(spec: QuestionSpec, a: Answer): number {
  if (spec.kind === "score") return a.value + 1;
  const p = Math.min(1, Math.max(0, a.value));
  return 1 + 4 * (spec.inverted ? 1 - p : p);
}

/**
 * Final 1 to 5 score: Σ share × contribution. Null when any weighted question has no answer for him
 * (no partial scores).
 */
export function finalScore(
  specs: readonly QuestionSpec[],
  shares: Readonly<Record<string, number>>,
  answers: Readonly<Record<string, Answer | undefined>>,
): number | null {
  let total = 0;
  let weight = 0;
  for (const s of specs) {
    const share = shares[s.id] ?? 0;
    if (share <= 0) continue;
    const a = answers[s.id];
    if (!a) return null;
    total += (share / 100) * contribution(s, a);
    weight += share / 100;
  }
  return weight > 0 ? total / weight : null;
}

// ---------- cost text ----------

export function costText(usd: number, players: number): string {
  const n = `${players} player${players === 1 ? "" : "s"}`;
  if (players === 0) return "Nothing to score.";
  if (usd <= 0) return `Free: all ${n} already scored.`;
  if (usd < 0.005) return `~$0.01 or less for ${n}`;
  return `~$${usd.toFixed(2)} for ${n}`;
}
