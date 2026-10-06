import { describe, expect, it } from "vitest";
import { extractNumerals, hasSnakeIdentifier, numeralMatches, numeralsAllowed } from "./numerals";

describe("numeralMatches", () => {
  it("allows a rounded restatement of a payload value", () => {
    expect(numeralMatches(6, 6.36)).toBe(true);
    expect(numeralMatches(6.4, 6.36)).toBe(true);
    expect(numeralMatches(6.36, 6.36)).toBe(true);
  });

  it("allows a one-step percent from a 1.xxx factor", () => {
    expect(numeralMatches(14, 1.137)).toBe(true);
    expect(numeralMatches(13.7, 1.137)).toBe(true);
  });

  it("allows float noise on a payload value", () => {
    expect(numeralMatches(19.476399999999998, 19.4764)).toBe(true);
  });

  it("rejects a figure that cannot be tied to the payload", () => {
    expect(numeralMatches(28, 6.36)).toBe(false);
    expect(numeralMatches(28, 1.137)).toBe(false);
  });
});

describe("numeralsAllowed", () => {
  const payload = { mean: 6.36, factor: 1.137, att: 35 };

  it("accepts about-six and a percent restatement", () => {
    expect(numeralsAllowed("about six points above the market", payload).ok).toBe(true);
    expect(numeralsAllowed("a 14% boost from the starter factor", payload).ok).toBe(true);
    expect(numeralsAllowed("35 attempts in the lookback", payload).ok).toBe(true);
  });

  it("rejects an invented number", () => {
    const r = numeralsAllowed("Indianapolis should score 28", payload);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.bad).toContain(28);
  });

  it("accepts a percent from a ratio of two payload values", () => {
    const sides = { mean: 25.109, market: 18.75, factor: 1.137 };
    expect(numeralsAllowed("about 34% above the market total", sides).ok).toBe(true);
    expect(numeralsAllowed("efficiency 14% higher", sides).ok).toBe(true);
  });
});

describe("hasSnakeIdentifier", () => {
  it("flags underscore-cased field names and allows plain language", () => {
    expect(hasSnakeIdentifier("qb_pass_factor 1.137")).toBe(true);
    expect(hasSnakeIdentifier("off_ppd_raw and market_implied_pts")).toBe(true);
    expect(hasSnakeIdentifier("Malik Willis's factor is 14% higher")).toBe(false);
  });
});

describe("extractNumerals", () => {
  it("pulls integers and decimals", () => {
    expect(extractNumerals("6.36 and 1.137")).toEqual([6.36, 1.137]);
  });
});
