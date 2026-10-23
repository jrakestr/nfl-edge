import { locDispatchInputs } from "./loc-update";

describe("locDispatchInputs", () => {
  it("accepts a season year", () => {
    expect(locDispatchInputs(2026)).toEqual({ ok: true, season: "2026" });
  });

  it("rejects a missing or out-of-range season", () => {
    expect(locDispatchInputs(undefined).ok).toBe(false);
    expect(locDispatchInputs("week").ok).toBe(false);
    expect(locDispatchInputs(1999).ok).toBe(false);
  });
});
