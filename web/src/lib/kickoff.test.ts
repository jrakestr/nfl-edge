import { describe, expect, it } from "vitest";
import { hasStarted, kickoffCutoff, stillToPlay } from "./kickoff";

describe("kickoffCutoff", () => {
  it("uses stored gametime on a home game", () => {
    const k = kickoffCutoff("2026-09-13", "13:00", "Home");
    expect(k.toISOString()).toBe("2026-09-13T17:00:00.000Z");
  });

  it("cuts a Neutral site at midnight ET, not the stored evening time", () => {
    const k = kickoffCutoff("2026-09-10", "20:35", "Neutral");
    expect(k.toISOString()).toBe("2026-09-10T04:00:00.000Z");
  });

  it("treats a missing time as end of day ET", () => {
    const k = kickoffCutoff("2026-09-13", null, "Home");
    expect(k.toISOString()).toBe("2026-09-14T03:59:00.000Z");
  });
});

describe("hasStarted", () => {
  it("is false before cutoff and true at or after", () => {
    const gameday = "2026-09-13";
    const time = "13:00";
    expect(hasStarted(gameday, time, "Home", new Date("2026-09-13T16:59:00.000Z"))).toBe(false);
    expect(hasStarted(gameday, time, "Home", new Date("2026-09-13T17:00:00.000Z"))).toBe(true);
  });

  it("marks a Neutral game started from midnight ET", () => {
    expect(hasStarted("2026-10-04", "20:35", "Neutral", new Date("2026-10-04T04:00:00.000Z"))).toBe(true);
    expect(hasStarted("2026-10-04", "20:35", "Neutral", new Date("2026-10-04T03:59:00.000Z"))).toBe(false);
  });
});

describe("stillToPlay", () => {
  it("is the complement of has_started", () => {
    expect(stillToPlay({ has_started: false })).toBe(true);
    expect(stillToPlay({ has_started: true })).toBe(false);
  });
});
