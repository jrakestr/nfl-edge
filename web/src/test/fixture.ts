/**
 * Week 1 fixture → the props the Edge board takes. `week1.json` is the output of
 * `nfl-edge lines --season 2026 --week 1 --json`; its `games[i]` objects are byte-for-byte the
 * `payload` rows in model.verdicts_latest for that run, so the same file feeds both the
 * VerdictRow side (Plain English) and, via each payload's `edges` array, the BoardRow side (Table).
 */
import type { TrackRecord } from "@/lib/queries/results";
import { pivotEdges, type RawEdge } from "@/lib/edge";
import { BoardRowSchema, VerdictPayloadSchema, type BoardRow, type GameChecks, type VerdictRow, type VerdictPayload } from "@/lib/types";
import raw from "./fixtures/week1.json";

type Fixture = {
  run: { run_id: string; season: number; week: number; draws: number };
  games: unknown[];
};

export const fixture = raw as Fixture;

/** The week summary sentence, carried on every payload as `week_summary`. */
export const fixtureSummary = (fixture.games[0] as { week_summary: string }).week_summary;

export function fixturePayloads(): VerdictPayload[] {
  return fixture.games.map((g) => VerdictPayloadSchema.parse(g));
}

export function fixtureVerdicts(): VerdictRow[] {
  return fixturePayloads().map((payload) => ({
    game_id: payload.game_id,
    market_line_id: payload.market?.snapshot_id ?? 0,
    payload,
  }));
}

/** A BoardRow per game, built the way board.ts builds it from proj_games + market_lines + edges. */
export function fixtureRows(): BoardRow[] {
  return fixturePayloads().map((p) => {
    const [gameday, gametime] = p.kickoff.split(" ");
    return BoardRowSchema.parse({
      game_id: p.game_id,
      home: p.home,
      away: p.away,
      gameday,
      gametime: gametime ?? null,
      fair_spread: p.fair.spread,
      fair_total: p.fair.total,
      mean_spread: p.fair.spread_mean ?? null,
      mean_total: p.fair.total_mean ?? null,
      home_win_prob: p.fair.home_win_prob,
      p_home_cover_market: p.edges.find((e) => e.market_type === "spread" && e.side === "home")?.model_prob ?? null,
      p_over_market: p.edges.find((e) => e.market_type === "total" && e.side === "over")?.model_prob ?? null,
      market_line_id: p.market?.snapshot_id ?? null,
      captured_at: p.market?.captured_at ?? null,
      spread_line: p.market?.spread ?? null,
      total_line: p.market?.total ?? null,
      home_spread_odds: p.market?.home_spread_odds ?? null,
      away_spread_odds: p.market?.away_spread_odds ?? null,
      over_odds: p.market?.over_odds ?? null,
      under_odds: p.market?.under_odds ?? null,
      home_moneyline: p.market?.home_moneyline ?? null,
      away_moneyline: p.market?.away_moneyline ?? null,
      edges: pivotEdges(p.edges as RawEdge[]),
    });
  });
}

export function fixtureChecks(): Record<string, GameChecks> {
  return Object.fromEntries(
    fixturePayloads().map((p) => [
      p.game_id,
      { game_id: p.game_id, status: p.status, failed: p.status === "ok" ? [] : ["market_gap"], invariants: 0, warnings: p.status === "ok" ? 0 : 1 },
    ]),
  );
}

export const NO_TRACK: TrackRecord = { gradedWeeks: 0, wins: 0, losses: 0, pushes: 0, roi: null };

/** Rewrite a payload into the three states the board must render without a live example. */
export function asFailed(p: VerdictPayload): VerdictPayload {
  return {
    ...p,
    status: "fail",
    sentences: ["This run failed an invariant for this game; edges withheld."],
    chips: null,
    max_edge: 0,
    edges: [],
  };
}

export function asNoLine(p: VerdictPayload): VerdictPayload {
  const fav = p.fair.spread != null && p.fair.spread > 0 ? p.home : p.away;
  return {
    ...p,
    status: "ok",
    sentences: [`No line posted yet. We have ${fav} favored by ${Math.abs(p.fair.spread ?? 0).toFixed(1)} points.`],
    chips: null,
    market: null,
    max_edge: 0,
    edges: [],
  };
}

export function asMoved(p: VerdictPayload): VerdictPayload {
  if (!p.market) throw new Error("asMoved needs a market");
  return {
    ...p,
    market: {
      ...p.market,
      moved_since_sim: {
        spread: { from: (p.market.spread ?? 0) - 1, to: p.market.spread ?? 0 },
        total: null,
      },
    },
  };
}
