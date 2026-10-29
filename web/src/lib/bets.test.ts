import { describe, expect, it } from "vitest";
import { fixtureChecks, fixtureRows } from "@/test/fixture";
import type { BoardRow, GameChecks } from "./types";
import { weekBets } from "./bets";

function baseRow(over: Partial<BoardRow> = {}): BoardRow {
  const r = fixtureRows()[0]!;
  return {
    ...r,
    game_id: "2026_07_NE_JAX",
    away: "NE",
    home: "JAX",
    has_started: false,
    is_final: false,
    spread_line: 3.5,
    total_line: 42.5,
    edges: {
      spread_home: { model_prob: 0.569, market_prob: 0.524, edge: 0.045, kelly_fraction: 0.012, price: -110 },
      spread_away: { model_prob: 0.431, market_prob: 0.476, edge: -0.045, kelly_fraction: 0, price: -110 },
      total_over: { model_prob: 0.51, market_prob: 0.5, edge: 0.01, kelly_fraction: 0.002, price: -110 },
      total_under: { model_prob: 0.49, market_prob: 0.5, edge: -0.01, kelly_fraction: 0, price: -110 },
      ml_home: { model_prob: 0.62, market_prob: 0.61, edge: 0.01, kelly_fraction: 0.001, price: -165 },
      ml_away: { model_prob: 0.38, market_prob: 0.39, edge: -0.01, kelly_fraction: 0, price: 140 },
    },
    ...over,
  };
}

function okCheck(game_id: string, over: Partial<GameChecks> = {}): GameChecks {
  return {
    game_id,
    status: "ok",
    failed: [],
    failedRows: [],
    invariants: 0,
    warnings: 0,
    ...over,
  };
}

describe("weekBets", () => {
  it("Scenario 6: returns a qualifying bet when game is not started, status ok, no gap warning, and edge >= 0.03", () => {
    const row = baseRow();
    const checks = { [row.game_id]: okCheck(row.game_id) };
    const res = weekBets([row], checks);
    expect(res.withheld).toEqual([]);
    expect(res.bets).toHaveLength(1);
    expect(res.bets[0]).toMatchObject({
      gameId: "2026_07_NE_JAX",
      away: "NE",
      home: "JAX",
      marketType: "spread",
      side: "home",
      pickLabel: "JAX −3.5",
      line: "−3.5",
      price: -110,
      edge: 0.045,
      modelProb: 0.569,
      marketProb: 0.524,
      kellyFraction: 0.012,
    });
  });

  it("Scenario 7: failed invariant withholds the game and names the failed check and count of failed teams", () => {
    const r1 = baseRow({ game_id: "2026_07_NE_JAX", away: "NE", home: "JAX" });
    const r2 = baseRow({ game_id: "2026_07_DET_MIN", away: "DET", home: "MIN" });
    const checks: Record<string, GameChecks> = {
      [r1.game_id]: okCheck(r1.game_id, {
        status: "fail",
        failed: ["opportunity_totals"],
        failedRows: [
          { check_name: "opportunity_totals", value: 1.4, threshold: 1.0, team: "NE", severity: "invariant" },
          { check_name: "opportunity_totals", value: 1.3, threshold: 1.0, team: "JAX", severity: "invariant" },
        ],
        invariants: 2,
      }),
      [r2.game_id]: okCheck(r2.game_id, {
        status: "fail",
        failed: ["opportunity_totals"],
        failedRows: [
          { check_name: "opportunity_totals", value: 1.5, threshold: 1.0, team: "DET", severity: "invariant" },
          { check_name: "opportunity_totals", value: 1.2, threshold: 1.0, team: "MIN", severity: "invariant" },
        ],
        invariants: 2,
      }),
    };
    const res = weekBets([r1, r2], checks);
    expect(res.bets).toEqual([]);
    expect(res.withheld).toHaveLength(1);
    expect(res.withheld[0]?.checkName).toBe("opportunity_totals");
    expect(res.withheld[0]?.failedTeams).toBe(4);
    expect(res.withheld[0]?.reason).toMatch(/opportunity_totals/);
    expect(res.withheld[0]?.reason).toMatch(/4/);
  });

  it("Scenario 8: spread_gap_vs_market warning withholds spread and moneyline with 'model and market differ by more than 4 points; check news'", () => {
    const row = baseRow({
      edges: {
        ...baseRow().edges,
        spread_home: { model_prob: 0.72, market_prob: 0.52, edge: 0.2, kelly_fraction: 0.08, price: -110 },
        ml_home: { model_prob: 0.78, market_prob: 0.6, edge: 0.18, kelly_fraction: 0.07, price: -150 },
        total_over: { model_prob: 0.57, market_prob: 0.52, edge: 0.05, kelly_fraction: 0.02, price: -110 },
      },
    });
    const checks: Record<string, GameChecks> = {
      [row.game_id]: okCheck(row.game_id, {
        status: "warn",
        failed: ["spread_gap_vs_market"],
        failedRows: [
          { check_name: "spread_gap_vs_market", value: 6.4, threshold: 4.0, team: null, severity: "warning" },
        ],
        warnings: 1,
      }),
    };
    const res = weekBets([row], checks);
    expect(res.bets.map((b) => b.marketType)).toEqual(["total"]);
    expect(res.withheld).toHaveLength(1);
    expect(res.withheld[0]?.reason).toContain("model and market differ by more than 4 points; check news");
  });

  it("Scenario 9: excludes started games and edges below 0.03, and sorts qualifying bets by edge desc", () => {
    const started = baseRow({ game_id: "2026_07_DEN_NO", has_started: true });
    const smallEdge = baseRow({
      game_id: "2026_07_BUF_TEN",
      edges: {
        ...baseRow().edges,
        spread_home: { model_prob: 0.54, market_prob: 0.52, edge: 0.02, kelly_fraction: 0.005, price: -110 },
      },
    });
    const multi = baseRow({
      game_id: "2026_07_KC_SF",
      away: "KC",
      home: "SF",
      edges: {
        ...baseRow().edges,
        spread_home: { model_prob: 0.56, market_prob: 0.52, edge: 0.04, kelly_fraction: 0.01, price: -110 },
        total_under: { model_prob: 0.59, market_prob: 0.52, edge: 0.07, kelly_fraction: 0.025, price: -110 },
      },
    });
    const checks = {
      ...fixtureChecks(),
      [started.game_id]: okCheck(started.game_id),
      [smallEdge.game_id]: okCheck(smallEdge.game_id),
      [multi.game_id]: okCheck(multi.game_id),
    };
    const res = weekBets([started, smallEdge, multi], checks);
    expect(res.bets.map((b) => [b.gameId, b.marketType, b.edge])).toEqual([
      ["2026_07_KC_SF", "total", 0.07],
      ["2026_07_KC_SF", "spread", 0.04],
    ]);
  });
});
