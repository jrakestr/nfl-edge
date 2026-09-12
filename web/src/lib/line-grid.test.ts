import {
  americanToProb,
  buildLineGrid,
  conditionalProb,
  devigTwoWay,
  edgesFromGrid,
  lookupSpread,
  lookupTotal,
  resolveBoardEdges,
} from "./line-grid";

const MARGIN = [10, 7, 7, 3, 0, -3, -7];
const TOTAL = [38, 42, 44, 45, 48, 51, 55];

/** Same SNAP / CFG numbers as tests/test_edge.py. */
const SNAP = {
  spread_line: 7.0,
  total_line: 44.5,
  home_spread_odds: -108,
  away_spread_odds: -112,
  over_odds: -110,
  under_odds: -110,
  home_moneyline: -300,
  away_moneyline: 250,
};

describe("odds math matches market.edge", () => {
  it("americanToProb known values", () => {
    expect(americanToProb(-110)).toBeCloseTo(110 / 210);
    expect(americanToProb(150)).toBeCloseTo(0.4);
  });

  it("devigTwoWay at -108/-112 matches the Python fixture", () => {
    const { fair, hold } = devigTwoWay(-108, -112);
    expect(fair).toBeCloseTo(0.4956702459300312);
    expect(hold).toBeCloseTo(0.0475326560232221);
  });
});

describe("line grid", () => {
  const grid = buildLineGrid(MARGIN, TOTAL);

  it("spread 7 is push-conditional 0.2 (Python GRID_MARGIN fixture)", () => {
    const looked = lookupSpread(grid, 7);
    expect(looked).not.toBeNull();
    const [win, push] = looked!;
    expect(win).toBeCloseTo(1 / 7);
    expect(push).toBeCloseTo(2 / 7);
    expect(conditionalProb(win, push)).toBeCloseTo(0.2);
  });

  it("moneyline is the grid at spread 0, not half-push", () => {
    const looked = lookupSpread(grid, 0);
    expect(looked).not.toBeNull();
    const [win, push] = looked!;
    expect(conditionalProb(win, push)).toBeCloseTo(2 / 3);
    expect(conditionalProb(win, push)).not.toBeCloseTo(win + 0.5 * push);
  });

  it("total 44.5 has no push", () => {
    const looked = lookupTotal(grid, 44.5);
    expect(looked).not.toBeNull();
    const [win, push] = looked!;
    expect(push).toBe(0);
    expect(conditionalProb(win, push)).toBeCloseTo(4 / 7);
  });

  it("edgesFromGrid matches the Python snapshot_edges model/market/edge", () => {
    const e = edgesFromGrid(grid, SNAP);
    expect(e.spread_home?.model_prob).toBeCloseTo(0.2);
    expect(e.spread_home?.market_prob).toBeCloseTo(0.4956702459300312);
    expect(e.spread_home?.edge).toBeCloseTo(0.2 - 0.4956702459300312);
    expect(e.spread_home?.price).toBe(-108);
    expect(e.ml_home?.model_prob).toBeCloseTo(2 / 3);
    expect(e.ml_home?.market_prob).toBeCloseTo(0.7241379310344829);
    expect(e.total_over?.model_prob).toBeCloseTo(4 / 7);
    expect(e.total_over?.market_prob).toBeCloseTo(0.5);
  });

  it("uses persisted edges only when market_line_id equals the current snapshot", () => {
    const stale: Parameters<typeof resolveBoardEdges>[0]["persisted"] = [
      {
        market_type: "spread",
        side: "home",
        model_prob: 0.99,
        market_prob: 0.5,
        edge: 0.49,
        kelly_fraction: 0.1,
        price: -110,
        market_line_id: 1,
      },
    ];
    const behind = resolveBoardEdges({
      snapshotId: 2,
      persisted: stale,
      persistedLineId: 1,
      grid,
      snap: SNAP,
    });
    expect(behind.spread_home?.model_prob).toBeCloseTo(0.2);
    expect(behind.spread_home?.model_prob).not.toBeCloseTo(0.99);

    const current = resolveBoardEdges({
      snapshotId: 1,
      persisted: stale,
      persistedLineId: 1,
      grid,
      snap: SNAP,
    });
    expect(current.spread_home?.model_prob).toBeCloseTo(0.99);
  });
});
