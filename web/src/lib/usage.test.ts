import { bandsFromHist, defenseSentence, formatRate, metricsFor, ordinal } from "@/lib/usage";

describe("usage helpers", () => {
  it("bandsFromHist splits histogram mass into scoring bands, pro-rating bins that straddle an edge", () => {
    // Two bins: [0,10) with 60 draws, [10,20) with 40 draws.
    const bands = bandsFromHist({ bins: [0, 10, 20], counts: [60, 40] });
    const p = Object.fromEntries(bands.map((b) => [b.label, b.p]));
    expect(p["0–5"]).toBeCloseTo(0.3);
    expect(p["5–10"]).toBeCloseTo(0.3);
    expect(p["10–15"]).toBeCloseTo(0.2);
    expect(p["15–20"]).toBeCloseTo(0.2);
    expect(p["20–30"]).toBeCloseTo(0);
    expect(p["30+"]).toBeCloseTo(0);
    expect(bands.reduce((a, b) => a + b.p, 0)).toBeCloseTo(1);
  });

  it("bandsFromHist ignores mass below zero and returns zeros without a histogram", () => {
    const bands = bandsFromHist({ bins: [-5, 5], counts: [100] });
    expect(bands[0]!.p).toBeCloseTo(1);
    expect(bandsFromHist(null).every((b) => b.p === 0)).toBe(true);
  });

  it("formatRate formats shares as percents, routes as counts, rates to two places", () => {
    expect(formatRate("target_share", 0.226)).toBe("23%");
    expect(formatRate("routes_pg_est", 23.6)).toBe("24");
    expect(formatRate("fp_per_target", 2.104)).toBe("2.10");
    expect(formatRate("dk_pg", 11.94)).toBe("11.9");
    expect(formatRate("fp_per_snap", null)).toBe("—");
  });

  it("metricsFor picks position-appropriate rates", () => {
    expect(metricsFor("QB")).toContain("fp_per_dropback");
    expect(metricsFor("QB")).not.toContain("fp_per_target");
    expect(metricsFor("RB")).toContain("fp_per_rush");
    expect(metricsFor("WR")).toContain("yprr_est");
  });

  it("ordinal and defenseSentence read as plain English", () => {
    expect(ordinal(1)).toBe("1st");
    expect(ordinal(2)).toBe("2nd");
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(23)).toBe("23rd");
    const s = defenseSentence(
      { defense: "SF", position: "TE", games: 6, allowed_pg: 9.4, league_avg: 13.9, rank: 32, of: 32 },
      "TE",
    );
    expect(s).toBe("SF allows 4.5 fewer DK points per game to TEs than average (9.4 vs 13.9), 32nd most of 32.");
    expect(defenseSentence(null, "WR")).toMatch(/No points-allowed data/);
  });
});
