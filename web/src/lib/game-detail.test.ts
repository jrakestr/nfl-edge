import { corrLabel, markerPercent, nearestRunSnapId, signedCorr, trimIntHist } from "./game-detail";
import { plural } from "./format";

describe("plural", () => {
  it("inflects singular and plural counts", () => {
    expect(plural(1, "invariant")).toBe("1 invariant");
    expect(plural(0, "invariant")).toBe("0 invariants");
    expect(plural(2, "warning")).toBe("2 warnings");
  });
});

describe("trimIntHist", () => {
  it("strips leading and trailing zero counts and totals draws", () => {
    const out = trimIntHist({ lo: -5, counts: [0, 0, 2, 5, 3, 0] });
    expect(out).toEqual({ lo: -3, hi: -1, counts: [2, 5, 3], draws: 10, max: 5 });
  });

  it("returns null for empty or all-zero histograms", () => {
    expect(trimIntHist(null)).toBeNull();
    expect(trimIntHist({ lo: 0, counts: [0, 0] })).toBeNull();
  });
});

describe("markerPercent", () => {
  it("places bin centers inside 0..100 and clamps out-of-range values", () => {
    expect(markerPercent(0, 0, 0)).toBe(50);
    expect(markerPercent(-10, 0, 10)).toBe(0);
    expect(markerPercent(20, 0, 10)).toBe(100);
    expect(markerPercent(null, 0, 10)).toBeNull();
  });
});

describe("nearestRunSnapId", () => {
  const snaps = [
    { id: 1, captured_at: "2026-09-10T12:00:00.000Z", spread_line: -3, total_line: 45, home_moneyline: null, away_moneyline: null },
    { id: 2, captured_at: "2026-09-12T17:50:00.000Z", spread_line: -3.5, total_line: 45.5, home_moneyline: null, away_moneyline: null },
    { id: 3, captured_at: "2026-09-13T12:00:00.000Z", spread_line: -4, total_line: 46, home_moneyline: null, away_moneyline: null },
  ];

  it("picks the snapshot closest to runCreatedAt", () => {
    expect(nearestRunSnapId(snaps, "2026-09-12T18:00:00.000Z")).toBe(2);
    expect(nearestRunSnapId([], "2026-09-12T18:00:00.000Z")).toBeNull();
    expect(nearestRunSnapId(snaps, null)).toBeNull();
  });
});

describe("corrLabel and signedCorr", () => {
  it("classifies correlation strength and formats signed values with unicode minus", () => {
    expect(corrLabel(0.42)).toBe("usually up");
    expect(corrLabel(0.15)).toBe("slightly up");
    expect(corrLabel(0.03)).toBe("flat");
    expect(corrLabel(-0.22)).toBe("usually down");
    expect(signedCorr(0.42)).toBe("+0.42");
    expect(signedCorr(-0.31)).toBe("\u22120.31");
  });
});
