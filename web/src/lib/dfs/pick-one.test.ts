import type { DfsLineup } from "@/lib/types";
import {
  SALARY_CAP,
  SALARY_LEAVE_MAX,
  lineupFloor,
  lineupRtsTotal,
  pickOne,
  rtsFlags,
  screenLineup,
  summedFieldOwn,
} from "./pick-one";

const CAP = SALARY_CAP;
const MIN_SAL = CAP - SALARY_LEAVE_MAX;

function lu(partial: Partial<DfsLineup> & { lineup_id: string }): DfsLineup {
  return {
    salary_used: MIN_SAL,
    stack: "DET 3",
    proj_fpts: 120,
    sim_win_pct: 0.1,
    sim_roi: 0.2,
    players: [
      { slot: "QB", name: "Jared Goff", dk_id: "qb" },
      { slot: "WR", name: "Amon-Ra St. Brown", dk_id: "wr" },
      { slot: "RB", name: "Jahmyr Gibbs", dk_id: "rb" },
    ],
    ...partial,
  };
}

const ids = { qb: "00-gof", wr: "00-arsb", rb: "00-g" };
const teams = { "jared goff": "DET", "amon-ra st. brown": "DET", "jahmyr gibbs": "DET" };
const positions = { "jared goff": "QB", "amon-ra st. brown": "WR", "jahmyr gibbs": "RB" };
const p10 = { "00-gof": 12, "00-arsb": 10, "00-g": 8 };
const ours = { "00-gof": 18, "00-arsb": 16, "00-g": 14 };
const own = { "00-gof": 0.2, "00-arsb": 0.15, "00-g": 0.1 };

const ctx = {
  dkToPlayerId: ids,
  teams,
  positions,
  p10,
  ours,
  ownFieldSim: own,
  rts: {} as Record<string, number>,
  overrides: {} as Record<string, { status: string | null; usage: number | null }>,
  staleDkIds: new Set<string>(),
};

describe("screenLineup", () => {
  it("removes a current out or doubtful player", () => {
    const out = screenLineup(lu({ lineup_id: "1" }), {
      ...ctx,
      overrides: { "00-g": { status: "out", usage: 0 } },
    });
    expect(out).toContain("Out: Jahmyr Gibbs");
    const d = screenLineup(lu({ lineup_id: "1" }), {
      ...ctx,
      overrides: { "00-g": { status: "doubtful", usage: 1 } },
    });
    expect(d).toContain("Doubtful: Jahmyr Gibbs");
  });

  it("removes usage below 0.5", () => {
    const reasons = screenLineup(lu({ lineup_id: "1" }), {
      ...ctx,
      overrides: { "00-g": { status: "questionable", usage: 0.4 } },
    });
    expect(reasons).toContain("Usage is cut: Jahmyr Gibbs");
  });

  it("removes a stale injury dk id", () => {
    const reasons = screenLineup(lu({ lineup_id: "1" }), {
      ...ctx,
      staleDkIds: new Set(["rb"]),
    });
    expect(reasons).toContain("Projected before the injury report: Jahmyr Gibbs");
  });

  it("removes leftover salary over 1,500", () => {
    const reasons = screenLineup(lu({ lineup_id: "1", salary_used: MIN_SAL - 1 }), ctx);
    expect(reasons).toContain("Leaves more than 1,500 unused");
  });

  it("removes a repeated player id", () => {
    const reasons = screenLineup(
      lu({
        lineup_id: "1",
        players: [
          { slot: "CPT", name: "Jared Goff", dk_id: "qb-cpt" },
          { slot: "FLEX", name: "Jared Goff", dk_id: "qb-flx" },
        ],
      }),
      { ...ctx, dkToPlayerId: { "qb-cpt": "00-gof", "qb-flx": "00-gof" } },
    );
    expect(reasons).toContain("Same player twice");
  });

  it("keeps a clean lineup", () => {
    expect(screenLineup(lu({ lineup_id: "1" }), ctx)).toEqual([]);
  });
});

describe("cash rank", () => {
  it("ranks by floor then our projection and hides GPP as the sort key", () => {
    const highFloor = lu({ lineup_id: "hi", proj_fpts: 110 });
    const lowFloor = lu({
      lineup_id: "lo",
      proj_fpts: 140,
      players: [
        { slot: "QB", name: "Jared Goff", dk_id: "qb" },
        { slot: "WR", name: "Amon-Ra St. Brown", dk_id: "wr" },
      ],
    });
    const picked = pickOne([lowFloor, highFloor], "cash", ctx);
    expect(picked.lineup?.lineup_id).toBe("hi");
    expect(picked.lineup && lineupFloor(picked.lineup, ctx)).toBe(30);
    expect(picked.hideSimStats).toBe(true);
  });
});

describe("tournament rank", () => {
  it("keeps a QB stack within 4 of the best and ranks by ROI", () => {
    const best = lu({ lineup_id: "ceil", proj_fpts: 130, sim_roi: 0.1 });
    const stacked = lu({ lineup_id: "stack", proj_fpts: 127, sim_roi: 0.4 });
    const noStack = lu({
      lineup_id: "solo",
      proj_fpts: 129,
      sim_roi: 0.9,
      stack: null,
      players: [
        { slot: "QB", name: "Jared Goff", dk_id: "qb" },
        { slot: "RB", name: "Jahmyr Gibbs", dk_id: "rb" },
      ],
    });
    const far = lu({ lineup_id: "far", proj_fpts: 120, sim_roi: 0.8 });
    const picked = pickOne([best, stacked, noStack, far], "tournament", ctx);
    expect(picked.lineup?.lineup_id).toBe("stack");
    expect(picked.hideSimStats).toBe(false);
    expect(picked.removed.map((r) => r.lineup.lineup_id).sort()).toEqual(["far", "solo"]);
    expect(picked.removed.find((r) => r.lineup.lineup_id === "solo")?.reasons).toContain(
      "Needs a quarterback stack",
    );
    expect(picked.removed.find((r) => r.lineup.lineup_id === "far")?.reasons).toContain(
      "More than 4 points behind the top projection",
    );
  });

  it("sums field ownership", () => {
    expect(summedFieldOwn(lu({ lineup_id: "1" }), ctx)).toBeCloseTo(0.45);
  });
});

describe("RTS cross-check", () => {
  it("flags a player more than 4 above RTS and prefers top 10 on both", () => {
    const rts = { "00-gof": 17, "00-arsb": 16, "00-g": 14, "00-xa": 0, "00-xb": 0, "00-xc": 0 };
    const flaggedCtx = { ...ctx, ours: { ...ours, "00-gof": 22 }, rts };
    expect(rtsFlags(lu({ lineup_id: "flag" }), flaggedCtx)).toEqual([
      "Our number is much higher than RTS on Jared Goff",
    ]);
    const chalk = lu({
      lineup_id: "ours-high",
      proj_fpts: 200,
      players: [
        { slot: "QB", name: "A", dk_id: "xa" },
        { slot: "WR", name: "B", dk_id: "xb" },
        { slot: "RB", name: "C", dk_id: "xc" },
      ],
    });
    const both = lu({ lineup_id: "both", proj_fpts: 139 });
    const filler = Array.from({ length: 10 }, (_, i) =>
      lu({
        lineup_id: `fill-${i}`,
        proj_fpts: 100 + i,
        players: [
          { slot: "QB", name: "Jared Goff", dk_id: "qb" },
          { slot: "WR", name: "Amon-Ra St. Brown", dk_id: "wr" },
        ],
      }),
    );
    const wide = {
      ...ctx,
      dkToPlayerId: { ...ids, xa: "00-xa", xb: "00-xb", xc: "00-xc" },
      p10: { ...p10, "00-xa": 20, "00-xb": 20, "00-xc": 20 },
      rts,
    };
    const picked = pickOne([chalk, both, ...filler], "cash", wide);
    expect(picked.lineup?.lineup_id).toBe("both");
    expect(picked.lineup && lineupRtsTotal(picked.lineup, wide)).toBeCloseTo(47);
    expect(picked.hasRts).toBe(true);
  });

  it("leaves RTS blank when the file is not loaded", () => {
    const picked = pickOne([lu({ lineup_id: "1" })], "cash", ctx);
    expect(picked.hasRts).toBe(false);
    expect(picked.lineup && lineupRtsTotal(picked.lineup, ctx)).toBeNull();
  });
});
