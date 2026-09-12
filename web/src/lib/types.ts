/**
 * Zod schemas for what the web app reads. The verdict payload is produced by
 * src/nfl_edge/outputs/lines.py (WeekVerdicts.to_dict()['games'][i]); schemas are lenient
 * (`.loose()`) so payload additions never break rendering. The sentences are authoritative;
 * the UI never regenerates grammar.
 */
import { z } from "zod";

const num = z.number();
const numOrNull = z.number().nullable();

export const ChipSchema = z
  .object({
    label: z.string().optional(), // absent on home_wins
    prob: num,
    market_prob: num,
    edge: num,
    kelly: num.optional(),
    price: z.number().int().nullable().optional(),
    market_type: z.string().optional(),
    side: z.string().optional(),
  })
  .loose();
export type Chip = z.infer<typeof ChipSchema>;

export const ChipsSchema = z
  .object({
    side: ChipSchema.nullable().optional(),
    total: ChipSchema.nullable().optional(),
    home_wins: ChipSchema.nullable().optional(),
  })
  .loose();

/** `market.moved_since_sim.{spread,total}`: null when unchanged, else the sim-time and current numbers. */
const MovedSchema = z.object({ from: num, to: num }).loose().nullable().optional();
export type Moved = z.infer<typeof MovedSchema>;

export const PayloadEdgeSchema = z
  .object({
    market_line_id: z.number().int(),
    ref_id: z.string(),
    market_type: z.enum(["spread", "total", "moneyline"]),
    side: z.enum(["home", "away", "over", "under"]),
    model_prob: num,
    market_prob: num,
    edge: num,
    kelly_fraction: num,
    price: z.number().int().nullable(),
    p_push: numOrNull.optional(),
    hold: numOrNull.optional(),
  })
  .loose();
export type PayloadEdge = z.infer<typeof PayloadEdgeSchema>;

export const VerdictPayloadSchema = z
  .object({
    game_id: z.string(),
    home: z.string(),
    away: z.string(),
    kickoff: z.string(), // 'YYYY-MM-DD HH:MM' ET
    status: z.enum(["ok", "warn", "fail"]),
    sentences: z.array(z.string()).min(1),
    chips: ChipsSchema.nullable(),
    max_edge: num,
    fair: z
      .object({
        spread: numOrNull, // nflverse convention: positive = home favored
        total: numOrNull,
        home_win_prob: numOrNull,
        spread_mean: numOrNull.optional(),
        total_mean: numOrNull.optional(),
        display: z.string().optional(),
      })
      .loose(),
    market: z
      .object({
        snapshot_id: z.number().int().nullable(),
        captured_at: z.string().nullable(),
        spread: numOrNull,
        total: numOrNull,
        home_spread_odds: z.number().int().nullable().optional(),
        away_spread_odds: z.number().int().nullable().optional(),
        over_odds: z.number().int().nullable().optional(),
        under_odds: z.number().int().nullable().optional(),
        home_moneyline: z.number().int().nullable().optional(),
        away_moneyline: z.number().int().nullable().optional(),
        moved_since_sim: z
          .object({ spread: MovedSchema, total: MovedSchema })
          .loose()
          .nullable()
          .optional(),
      })
      .loose()
      .nullable(),
    edges: z.array(PayloadEdgeSchema),
    calls: z
      .object({
        cover: z
          .object({
            market_type: z.string(),
            side: z.string(),
            call: z.string(), // 'pays' | 'does not pay' | 'coin flip'
            price: z.number().int().nullable(),
            needs: numOrNull,
          })
          .loose()
          .nullable()
          .optional(),
      })
      .loose()
      .nullable()
      .optional(),
    week_summary: z.string().optional(),
  })
  .loose();
export type VerdictPayload = z.infer<typeof VerdictPayloadSchema>;

export const RunRowSchema = z.object({
  run_id: z.string().uuid(),
  season: z.number().int(),
  week: z.number().int(),
  created_at: z.coerce.date(),
  draws_per_game: z.number().int().nullable(),
  git_sha: z.string().nullable(),
});
export type RunRow = z.infer<typeof RunRowSchema>;

export const WeekRunsSchema = z.object({
  week: z.number().int(),
  newest_run_id: z.string().uuid(),
  created_at: z.coerce.date(),
  runs: z.number().int(),
});
export type WeekRuns = z.infer<typeof WeekRunsSchema>;

export const VerdictRowSchema = z.object({
  game_id: z.string(),
  market_line_id: z.number().int(),
  payload: VerdictPayloadSchema,
});
export type VerdictRow = z.infer<typeof VerdictRowSchema>;

export const EdgeSideSchema = z.object({
  model_prob: num,
  market_prob: num,
  edge: num,
  kelly_fraction: num,
  price: z.number().int().nullable(),
});
export type EdgeSide = z.infer<typeof EdgeSideSchema>;

/** One table row on the Edge board: proj_games ⨝ schedules ⨝ edges_latest ⨝ latest snapshot. */
export const BoardRowSchema = z.object({
  game_id: z.string(),
  home: z.string(),
  away: z.string(),
  gameday: z.string(), // 'YYYY-MM-DD'
  gametime: z.string().nullable(), // 'HH:MM' ET
  fair_spread: numOrNull,
  fair_total: numOrNull,
  mean_spread: numOrNull,
  mean_total: numOrNull,
  home_win_prob: numOrNull,
  p_home_cover_market: numOrNull,
  p_over_market: numOrNull,
  market_line_id: z.number().int().nullable(),
  captured_at: z
    .union([z.date(), z.string()])
    .nullable()
    .transform((d) => (d == null ? null : typeof d === "string" ? d : d.toISOString())), // ISO, serializable
  spread_line: numOrNull, // nflverse convention (positive = home favored)
  total_line: numOrNull,
  home_spread_odds: z.number().int().nullable(),
  away_spread_odds: z.number().int().nullable(),
  over_odds: z.number().int().nullable(),
  under_odds: z.number().int().nullable(),
  home_moneyline: z.number().int().nullable(),
  away_moneyline: z.number().int().nullable(),
  edges: z.object({
    spread_home: EdgeSideSchema.nullable(),
    spread_away: EdgeSideSchema.nullable(),
    total_over: EdgeSideSchema.nullable(),
    total_under: EdgeSideSchema.nullable(),
    ml_home: EdgeSideSchema.nullable(),
    ml_away: EdgeSideSchema.nullable(),
  }),
  ngs_home_pts: numOrNull.optional(),
  ngs_away_pts: numOrNull.optional(),
  ngs_p_home_win: numOrNull.optional(),
});
export type BoardRow = z.infer<typeof BoardRowSchema>;

export const CheckStatusValue = z.enum(["ok", "warn", "fail"]);
export type CheckStatusValue = z.infer<typeof CheckStatusValue>;

export const GameChecksSchema = z.object({
  game_id: z.string(),
  status: CheckStatusValue,
  failed: z.array(z.string()), // check names, invariants first
  invariants: z.number().int(),
  warnings: z.number().int(),
});
export type GameChecks = z.infer<typeof GameChecksSchema>;

export const DfsSlotSchema = z.object({
  slot: z.string(),
  name: z.string(),
  dk_id: z.string().nullable().optional(),
});
export type DfsSlot = z.infer<typeof DfsSlotSchema>;

export const DfsLineupSchema = z.object({
  lineup_id: z.string(),
  salary_used: z.number().int().nullable(),
  stack: z.string().nullable(),
  proj_fpts: numOrNull,
  sim_win_pct: numOrNull,
  sim_roi: numOrNull,
  players: z.array(DfsSlotSchema),
});
export type DfsLineup = z.infer<typeof DfsLineupSchema>;

export const DfsExposureSchema = z.object({
  player_id: z.string(),
  name: z.string(),
  team: z.string().nullable(),
  sim_own: numOrNull,
  proj_own: numOrNull,
  leverage: numOrNull,
});
export type DfsExposure = z.infer<typeof DfsExposureSchema>;

export const CorrPairSchema = z.object({
  a: z.string(),
  b: z.string(),
  corr: num,
});
export type CorrPair = z.infer<typeof CorrPairSchema>;

export const HistSchema = z.object({
  bins: z.array(num),
  counts: z.array(z.number()),
});
export type Hist = z.infer<typeof HistSchema>;

export const FairPropSchema = z.object({
  player_id: z.string(),
  player_name: z.string(),
  position: z.string().nullable(),
  team: z.string().nullable(),
  opponent: z.string().nullable(),
  game_id: z.string().nullable(),
  home: z.string().nullable(),
  away: z.string().nullable(),
  stat: z.string(),
  fair_line: num,
  p_over: num,
  p10: numOrNull,
  p25: numOrNull,
  p75: numOrNull,
  p90: numOrNull,
  mean: numOrNull,
  sentence: z.string().nullable(),
  fpts_dk_mean: numOrNull,
  hist: HistSchema.nullable(),
  market_line: numOrNull,
  market_p_over: numOrNull,
  edge: numOrNull,
  lean: z.enum(["over", "under", "flat"]).nullable(),
  over_odds: z.number().int().nullable(),
  under_odds: z.number().int().nullable(),
  market_sentence: z.string().nullable(),
  market_price: z.number().int().nullable().optional(),
  market_side: z.string().nullable().optional(),
  sportsbook: z.string().nullable().optional(),
  one_sided: z.boolean().nullable().optional(),
});
export type FairProp = z.infer<typeof FairPropSchema>;

export const PropEdgeSchema = z.object({
  market_prop_id: z.number().int(),
  player_id: z.string(),
  player_name: z.string(),
  position: z.string().nullable().optional(),
  game_id: z.string().nullable(),
  home: z.string().nullable(),
  away: z.string().nullable(),
  stat: z.string(),
  line: num,
  p_over: numOrNull,
  model_prob: numOrNull,
  market_prob: numOrNull,
  edge: numOrNull,
  kelly_fraction: numOrNull,
  price: z.number().int().nullable(),
  under_odds: z.number().int().nullable(),
  over_odds: z.number().int().nullable(),
  sentence: z.string().nullable(),
  lean: z.enum(["over", "under", "flat"]).nullable(),
  typical: numOrNull,
});
export type PropEdge = z.infer<typeof PropEdgeSchema>;

export const PropSnapSchema = z.object({
  captured_at: z.string(),
  line: num,
  over_odds: z.number().int().nullable(),
  under_odds: z.number().int().nullable(),
});
export type PropSnap = z.infer<typeof PropSnapSchema>;

export const PlayerWeekSchema = z.object({
  season: z.number().int(),
  week: z.number().int(),
  gameday: z.string().nullable(),
  opponent: z.string().nullable(),
  team: z.string().nullable(),
  home: z.string().nullable(),
  away: z.string().nullable(),
  home_score: z.number().int().nullable(),
  away_score: z.number().int().nullable(),
  stats: z.record(z.string(), z.unknown()),
});
export type PlayerWeek = z.infer<typeof PlayerWeekSchema>;

export const WeekPlayerSchema = z.object({
  player_id: z.string(),
  display_name: z.string(),
  position: z.string().nullable(),
  team: z.string().nullable(),
  game_id: z.string().nullable(),
  fpts_dk_mean: numOrNull,
  typical_dk: numOrNull,
  hist: HistSchema.nullable(),
  player_dk_id: z.string().nullable().optional(),
  salary: z.number().int().nullable().optional(),
  opponent: z.string().nullable().optional(),
  kickoff: z.string().nullable().optional(),
  floor: numOrNull.optional(),
  ceiling: numOrNull.optional(),
  proj_own: numOrNull.optional(),
  value: numOrNull.optional(),
  override_status: z.string().nullable().optional(),
  override_updated_at: z.union([z.date(), z.string()]).nullable().optional(),
  run_created_at: z.union([z.date(), z.string()]).nullable().optional(),
});
export type WeekPlayer = z.infer<typeof WeekPlayerSchema>;

export type MatchupRow = { label: string; value: string };

export type PlayerHeader = {
  gsis_id: string;
  display_name: string;
  position: string | null;
  latest_team: string | null;
};

export type GameContext = {
  game_id: string;
  season: number;
  week: number;
  home: string;
  away: string;
  gameday: string;
  gametime: string | null;
};
