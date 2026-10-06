import { describe, expect, it } from "vitest";
import type { WeekPlayer } from "@/lib/types";
import { poolFromPlayers } from "./pool";

function wp(
  partial: Partial<WeekPlayer> & Pick<WeekPlayer, "player_id" | "display_name" | "player_dk_id">,
): WeekPlayer {
  return {
    position: "QB",
    team: "GB",
    game_id: "g1",
    fpts_dk_mean: 18,
    typical_dk: 18,
    hist: null,
    salary: 7000,
    ...partial,
  };
}

describe("poolFromPlayers", () => {
  it("keeps one row per player_id", () => {
    const pool = poolFromPlayers([
      wp({ player_id: "00-love", player_dk_id: "1", display_name: "Jordan Love" }),
      wp({ player_id: "00-willis", player_dk_id: "2", display_name: "Malik Willis", fpts_dk_mean: 12 }),
    ]);
    expect(pool.map((p) => p.player_id)).toEqual(["00-love", "00-willis"]);
  });

  it("raises when the same player_id has two DraftKings rows", () => {
    expect(() =>
      poolFromPlayers([
        wp({ player_id: "00-love", player_dk_id: "main-love", display_name: "Jordan Love" }),
        wp({ player_id: "00-love", player_dk_id: "aft-love", display_name: "Jordan Love" }),
      ]),
    ).toThrow(/Jordan Love .* more than once/);
  });

  it("allows the same player_id twice when the slate is showdown", () => {
    const pool = poolFromPlayers(
      [
        wp({ player_id: "00-love", player_dk_id: "cpt", display_name: "Jordan Love" }),
        wp({ player_id: "00-love", player_dk_id: "flex", display_name: "Jordan Love" }),
      ],
      { uniquePlayerId: false },
    );
    expect(pool).toHaveLength(2);
  });
});
