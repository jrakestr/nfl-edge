import { describe, expect, it } from "vitest";
import {
  groupStripGames,
  hasStarted,
  kickoffCutoff,
  kickoffWindow,
  stillToPlay,
  windowLabel,
  type StripGame,
} from "./kickoff";

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

describe("kickoffWindow", () => {
  it("buckets Sunday 1pm / 4pm / SNF", () => {
    expect(kickoffWindow("2026-09-13", "13:00", "Home")).toBe("early");
    expect(kickoffWindow("2026-09-13", "16:05", "Home")).toBe("afternoon");
    expect(kickoffWindow("2026-09-13", "16:25", "Home")).toBe("afternoon");
    expect(kickoffWindow("2026-09-13", "20:20", "Home")).toBe("primetime");
  });

  it("treats TNF and MNF as primetime", () => {
    expect(kickoffWindow("2026-09-10", "20:15", "Home")).toBe("primetime");
    expect(kickoffWindow("2026-09-14", "20:15", "Home")).toBe("primetime");
  });

  it("does not trust a Neutral stored clock", () => {
    expect(kickoffWindow("2026-09-10", "20:35", "Neutral")).toBeNull();
  });
});

describe("windowLabel", () => {
  it("maps early / afternoon / primetime / null", () => {
    expect(windowLabel("early")).toBe("1:00");
    expect(windowLabel("afternoon")).toBe("4:05/4:25");
    expect(windowLabel("primetime")).toBe("primetime");
    expect(windowLabel(null)).toBe("Other");
  });
});

describe("groupStripGames", () => {
  function g(partial: Partial<StripGame> & { game_id: string }): StripGame {
    return {
      away: "AWY",
      home: "HME",
      gameday: "2026-09-13",
      gametime: "13:00",
      location: "Home",
      away_score: null,
      home_score: null,
      is_final: false,
      ...partial,
    };
  }

  it("groups by window and orders groups by earliest kickoff", () => {
    const groups = groupStripGames([
      g({ game_id: "sun-late", gameday: "2026-09-13", gametime: "16:05" }),
      g({ game_id: "melb", gameday: "2026-09-10", gametime: "20:35", location: "Neutral" }),
      g({ game_id: "tnf", gameday: "2026-09-10", gametime: "20:15" }),
      g({ game_id: "sun-early", gameday: "2026-09-13", gametime: "13:00" }),
    ]);
    expect(groups.map((x) => x.label)).toEqual(["primetime", "Other", "1:00", "4:05/4:25"]);
    expect(groups.find((x) => x.label === "Other")?.games.map((x) => x.game_id)).toEqual(["melb"]);
    expect(groups.find((x) => x.label === "1:00")?.games.map((x) => x.game_id)).toEqual(["sun-early"]);
  });
});

describe("stillToPlay", () => {
  it("is the complement of has_started", () => {
    expect(stillToPlay({ has_started: false })).toBe(true);
    expect(stillToPlay({ has_started: true })).toBe(false);
  });
});
