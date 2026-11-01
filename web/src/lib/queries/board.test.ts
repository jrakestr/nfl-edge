import { describe, expect, it } from "vitest";
import { fixtureRows } from "@/test/fixture";
import { sortBoardRows } from "@/lib/board-sort";

describe("sortBoardRows", () => {
  it("orders games ascending by kickoff from first to last game played", () => {
    const rows = fixtureRows();
    const sunLate = { ...rows[0]!, game_id: "sun_snf", has_started: false, is_final: false, gameday: "2026-09-13", gametime: "20:20" };
    const sunEarly = { ...rows[1]!, game_id: "sun_early", has_started: false, is_final: false, gameday: "2026-09-13", gametime: "13:00" };
    const sunProg = { ...rows[2]!, game_id: "sun_prog", has_started: true, is_final: false, gameday: "2026-09-13", gametime: "16:25" };
    const tnfFin = { ...rows[3]!, game_id: "tnf_fin", has_started: true, is_final: true, gameday: "2026-09-10", gametime: "20:35" };
    const ordered = sortBoardRows([sunLate, sunEarly, sunProg, tnfFin]);
    expect(ordered.map((r) => r.game_id)).toEqual(["tnf_fin", "sun_early", "sun_prog", "sun_snf"]);
  });
});
