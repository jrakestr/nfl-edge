import { pickActualSeason, summarizeActuals } from "./player-actuals";

const wk = (season: number, week: number, fpts_dk: number, had = true): Parameters<
  typeof pickActualSeason
>[0][number] => ({
  season,
  week,
  opponent: "GB",
  gameday: "2025-09-07",
  fpts_dk,
  had_opportunity: had,
});

describe("pickActualSeason", () => {
  it("prefers current-season opportunity games", () => {
    expect(pickActualSeason([wk(2026, 1, 12), wk(2025, 18, 20)], 2026)).toBe(2026);
  });

  it("falls back to prior season when current has none", () => {
    expect(pickActualSeason([wk(2025, 1, 18), wk(2026, 1, 0, false)], 2026)).toBe(2025);
  });

  it("returns null when neither season has opportunity", () => {
    expect(pickActualSeason([wk(2025, 1, 0, false)], 2026)).toBeNull();
  });
});

describe("summarizeActuals", () => {
  it("labels the source season and uses opportunity GP", () => {
    const s = summarizeActuals([wk(2025, 2, 20), wk(2025, 1, 10), wk(2025, 3, 0, false)], 2026);
    expect(s).toMatchObject({ kind: "ok", season: 2025, gp: 2, ppg: 15 });
    if (s.kind === "ok") expect(s.games).toHaveLength(2);
  });

  it("is none when the lookup is empty", () => {
    expect(summarizeActuals([], 2026)).toEqual({ kind: "none" });
  });

  it("omits DST instead of showing an empty or leftover average", () => {
    expect(summarizeActuals([wk(2025, 1, 8)], 2026, "DST")).toEqual({ kind: "dst" });
    expect(summarizeActuals([], 2026, null, "LAC_DST")).toEqual({ kind: "dst" });
  });
});
