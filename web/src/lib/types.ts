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
          .object({ spread: numOrNull.optional(), total: numOrNull.optional() })
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
  captured_at: z.coerce.date().nullable(),
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
