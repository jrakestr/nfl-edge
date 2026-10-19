import { normalizeLabel, scoreText, termsText } from "./display";

describe("research display", () => {
  it("signs scores with a true minus and shows null as an em dash", () => {
    expect(scoreText(1.234)).toBe("+1.23");
    expect(scoreText(-0.5)).toBe("−0.50");
    expect(scoreText(0)).toBe("0.00");
    expect(scoreText(-0.001)).toBe("0.00");
    expect(scoreText(null)).toBe("—");
    expect(scoreText(Number.NaN)).toBe("—");
  });

  it("spells out terms and normalization without snake_case", () => {
    const text = termsText({ terms: [{ field: "target_share", weight: 3 }, { field: "snap_pct_l3", weight: -1 }] });
    expect(text).toBe("Target share (% of team targets) × 3, Snap share, last 3 games (%) × -1");
    expect(text).not.toMatch(/_/);
    expect(normalizeLabel("zscore")).toBe("Z-score within position");
    expect(normalizeLabel("none")).toBe("Raw values");
  });
});
