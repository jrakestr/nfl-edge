import { describe, expect, it } from "vitest";
import { buildPlayerAnalysis, deltaLabel, deltaTone, scoredLabel } from "./player-history";
import type { PlayerActualWeek } from "./player-actuals";
import type { PlayerWeek } from "./types";

function stat(week: number, stats: Record<string, number>, opponent = "BUF"): PlayerWeek {
  return {
    season: 2026,
    week,
    gameday: `2026-09-${String(week).padStart(2, "0")}`,
    opponent,
    team: "NE",
    home: "NE",
    away: opponent,
    home_score: 20,
    away_score: 17,
    stats,
  };
}

function actual(week: number, fpts_dk: number, had = true, opponent = "BUF"): PlayerActualWeek {
  return { season: 2026, week, opponent, gameday: null, fpts_dk, had_opportunity: had };
}

describe("buildPlayerAnalysis", () => {
  it("keeps a quarterback to passing and rushing on the unified row", () => {
    const model = buildPlayerAnalysis({
      position: "QB",
      season: 2026,
      week: 7,
      log: [stat(6, { passing_yards: 287, passing_tds: 3, passing_interceptions: 1, rushing_yards: 18, rushing_tds: 0, receptions: 1 })],
      actuals: [actual(6, 23.8)],
      projections: [{ season: 2026, week: 6, fpts_dk: 21.2, opponent: null }],
      simProjections: [{ season: 2026, week: 6, fpts_dk: 22.0, opponent: "BUF" }],
    });
    expect(model.columns.map((c) => c.header)).toEqual(["Pass yds", "Pass TD", "INT", "Rush yds", "Rush TD"]);
    expect(model.rows[0]?.values.passYds).toBe(287);
    expect(model.rows[0]?.values.rec).toBeUndefined();
    expect(model.rows[0]?.scored).toBe(23.8);
    expect(model.rows[0]?.simProjected).toBe(22.0);
    expect(model.rows[0]?.projected).toBe(21.2);
    expect(model.rows[0]?.delta).toBeCloseTo(1.8);
    expect(model.empty).toBeNull();
  });

  it("keeps a receiver to receiving and rushing", () => {
    const model = buildPlayerAnalysis({
      position: "WR",
      season: 2026,
      week: 7,
      log: [stat(6, { targets: 11, receptions: 8, receiving_yards: 96, receiving_tds: 1, carries: 1, rushing_yards: 4, passing_yards: 0 })],
      actuals: [actual(6, 14)],
      projections: [{ season: 2026, week: 7, fpts_dk: 22.9, opponent: "LV" }],
    });
    expect(model.columns.map((c) => c.header)).toEqual(["Targets", "Rec", "Rec yds", "Rec TD", "Carries", "Rush yds"]);
    expect(model.rows[0]?.values.targets).toBe(11);
    expect(model.rows[0]?.values.passYds).toBeUndefined();
  });

  it("does not treat the current week as scored without a final line, and populates upcoming projected counting stats and Sim-vs-FP delta", () => {
    const model = buildPlayerAnalysis({
      position: "QB",
      season: 2026,
      week: 7,
      log: [stat(6, { passing_yards: 200, passing_tds: 1, passing_interceptions: 0, rushing_yards: 10, rushing_tds: 0 })],
      actuals: [actual(6, 16.4), { ...actual(7, 99), season: 2026 }],
      projections: [
        { season: 2026, week: 6, fpts_dk: 18, opponent: "NYJ" },
        { season: 2026, week: 7, fpts_dk: 20.4, opponent: "ATL", stats: { pass_yds: 251, pass_td: 1.7, int: 0.7, rush_yds: 18, rush_td: 0.2 } },
      ],
      simProjections: [
        {
          season: 2026,
          week: 7,
          fpts_dk: 22.6,
          opponent: "ATL",
          stats: { pass_yds: 268.4, pass_td: 1.9, int: 0.6, rush_yds: 21.3, rush_td: 0.3 },
        },
      ],
    });
    const current = model.rows.find((r) => r.week === 7);
    expect(current?.upcoming).toBe(true);
    expect(current?.scored).toBeNull();
    expect(scoredLabel(current!)).toBe("\u2014");
    expect(current?.simProjected).toBe(22.6);
    expect(current?.projected).toBe(20.4);
    expect(current?.delta).toBeCloseTo(2.2);
    expect(current?.values.passYds).toBeCloseTo(268.4);
    expect(current?.values.passTd).toBeCloseTo(1.9);
    expect(current?.values.int).toBeCloseTo(0.6);
    expect(current?.values.rushYds).toBeCloseTo(21.3);
    expect(current?.values.rushTd).toBeCloseTo(0.3);
  });

  it("scores the current week when the stat line is already stored", () => {
    const model = buildPlayerAnalysis({
      position: "RB",
      season: 2026,
      week: 7,
      log: [stat(7, { carries: 12, rushing_yards: 80, rushing_tds: 1, receptions: 3, receiving_yards: 20 })],
      actuals: [actual(7, 19.0)],
      projections: [{ season: 2026, week: 7, fpts_dk: 15.5, opponent: "CHI" }],
    });
    const current = model.rows[0]!;
    expect(current.upcoming).toBe(false);
    expect(current.scored).toBe(19);
    expect(current.delta).toBeCloseTo(3.5);
    expect(deltaLabel(current.delta)).toBe("+3.5");
    expect(deltaTone(current.delta)).toBe("pos");
  });

  it("leaves earlier weeks blank when projections were not stored, and names the gap", () => {
    const model = buildPlayerAnalysis({
      position: "QB",
      season: 2026,
      week: 7,
      log: [stat(1, { passing_yards: 180 }), stat(5, { passing_yards: 300 })],
      actuals: [actual(1, 12.8), actual(5, 42.5)],
      projections: [
        { season: 2026, week: 5, fpts_dk: 18.5, opponent: null },
        { season: 2026, week: 7, fpts_dk: 21.1, opponent: "CHI" },
      ],
    });
    const first = model.rows.find((r) => r.week === 1)!;
    const fifth = model.rows.find((r) => r.week === 5)!;
    expect(first.scored).toBe(12.8);
    expect(first.projected).toBeNull();
    expect(first.delta).toBeNull();
    expect(fifth.delta).toBeCloseTo(24);
    expect(deltaTone(fifth.delta)).toBe("pos");
    expect(model.gap).toMatch(/not stored/);
    expect(model.rows.some((r) => r.week > 7)).toBe(false);
  });

  it("still renders stat and scored rows when FantasyPros rows are missing", () => {
    const model = buildPlayerAnalysis({
      position: "TE",
      season: 2026,
      week: 7,
      log: [stat(4, { targets: 4, receptions: 3, receiving_yards: 40, receiving_tds: 0, carries: 0, rushing_yards: 0 })],
      actuals: [actual(4, 7)],
      projections: [{ season: 2025, week: 4, fpts_dk: 9, opponent: "DAL" }],
    });
    expect(model.rows).toHaveLength(1);
    expect(model.rows[0]?.scored).toBe(7);
    expect(model.rows[0]?.projected).toBeNull();
    expect(model.rows[0]?.values.recYds).toBe(40);
    expect(model.empty).toBeNull();
  });

  it("does not borrow another season when this season has no stat line", () => {
    const model = buildPlayerAnalysis({
      position: "QB",
      season: 2026,
      week: 7,
      log: [{ ...stat(6, { passing_yards: 400 }), season: 2025 }],
      actuals: [{ ...actual(6, 30), season: 2025 }],
      projections: [{ season: 2026, week: 7, fpts_dk: 18, opponent: "CHI" }],
    });
    expect(model.rows.map((r) => r.week)).toEqual([7]);
    expect(model.rows[0]?.scored).toBeNull();
    expect(model.rows[0]?.upcoming).toBe(true);
  });

  it("marks a week with no opportunity as DNP and skips the delta", () => {
    const model = buildPlayerAnalysis({
      position: "WR",
      season: 2026,
      week: 3,
      log: [stat(2, { targets: 0, receptions: 0, receiving_yards: 0, receiving_tds: 0, carries: 0, rushing_yards: 0 })],
      actuals: [actual(2, 0, false)],
      projections: [{ season: 2026, week: 2, fpts_dk: 14.2, opponent: "SF" }],
    });
    const row = model.rows[0]!;
    expect(row.dnp).toBe(true);
    expect(scoredLabel(row)).toBe("DNP");
    expect(row.delta).toBeNull();
    expect(deltaTone(0)).toBe("flat");
    expect(deltaLabel(-4.2)).toBe("\u22124.2");
  });

  it("has no counting-stat table for a position outside QB, RB, WR, and TE when empty", () => {
    const model = buildPlayerAnalysis({
      position: "DST",
      season: 2026,
      week: 7,
      log: [],
      actuals: [],
      projections: [],
    });
    expect(model.empty).toBe("No counting stats for this position.");
    expect(model.rows).toEqual([]);
  });
});
