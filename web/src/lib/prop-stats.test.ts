import { corrLabel, weeklyValue } from "@/lib/prop-stats";

describe("weeklyValue", () => {
  it("reads nflverse jsonb keys", () => {
    const stats = { rushing_yards: 91, receiving_yards: 40, receptions: 5, rushing_tds: 1, receiving_tds: 0 };
    expect(weeklyValue(stats, "rush_yds")).toBe(91);
    expect(weeklyValue(stats, "rec_yds")).toBe(40);
    expect(weeklyValue(stats, "rec")).toBe(5);
    expect(weeklyValue(stats, "anytime_td")).toBe(1);
    expect(weeklyValue(stats, "rush_rec")).toBe(131);
  });
});

describe("corrLabel", () => {
  it("buckets DK-point correlation", () => {
    expect(corrLabel(0.5)).toBe("usually up");
    expect(corrLabel(0.15)).toBe("slightly up");
    expect(corrLabel(-0.4)).toBe("usually down");
    expect(corrLabel(0)).toBe("uncorrelated");
  });
});
