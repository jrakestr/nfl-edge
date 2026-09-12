import { describe, expect, it } from "vitest";
import { fixtureRows } from "@/test/fixture";
import { sortBoardRows } from "@/lib/board-sort";

describe("sortBoardRows", () => {
  it("puts still-to-play ahead of in-progress and finals", () => {
    const rows = fixtureRows();
    const live = { ...rows[0]!, game_id: "live", has_started: false, is_final: false };
    const live2 = { ...rows[1]!, game_id: "live2", has_started: false, is_final: false };
    const prog = { ...rows[2]!, game_id: "prog", has_started: true, is_final: false, gameday: "2026-09-13", gametime: "13:00" };
    const fin = { ...rows[3]!, game_id: "fin", has_started: true, is_final: true, gameday: "2026-09-10", gametime: "20:35" };
    const ordered = sortBoardRows([fin, prog, live, live2]);
    expect(ordered.map((r) => r.game_id).slice(0, 2).sort()).toEqual(["live", "live2"].sort());
    expect(ordered[2]!.game_id).toBe("prog");
    expect(ordered[3]!.game_id).toBe("fin");
  });
});
