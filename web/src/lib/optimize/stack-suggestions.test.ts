import { slateCorrIds, stackSuggestions, type SlateCorr } from "./stack-suggestions";
import type { WeekPlayer } from "@/lib/types";

function player(partial: Partial<WeekPlayer> & Pick<WeekPlayer, "player_id" | "display_name">): WeekPlayer {
  return {
    position: "WR",
    team: "KC",
    game_id: "g1",
    fpts_dk_mean: 12,
    fpts_dk_sd: 6,
    typical_dk: 10,
    hist: null,
    player_dk_id: partial.player_id,
    salary: 6000,
    value: 2,
    ...partial,
  };
}

const qb = player({
  player_id: "00-qb",
  player_dk_id: "dk-qb",
  display_name: "Patrick Mahomes",
  position: "QB",
  fpts_dk_mean: 22,
  fpts_dk_sd: 8,
  salary: 8000,
  value: 2.75,
});
const wr1 = player({
  player_id: "00-wr1",
  player_dk_id: "dk-wr1",
  display_name: "Rashee Rice",
  fpts_dk_mean: 14,
  fpts_dk_sd: 8,
  salary: 7000,
});
const checkdown = player({
  player_id: "00-rb",
  player_dk_id: "dk-rb",
  display_name: "Checkdown Back",
  position: "RB",
  fpts_dk_mean: 20,
  fpts_dk_sd: 3,
  salary: 7500,
});
const fade = player({
  player_id: "LAC_DST",
  player_dk_id: "dk-dst",
  display_name: "Chargers",
  position: "DST",
  team: "LAC",
  fpts_dk_mean: 7,
  fpts_dk_sd: 4,
  salary: 3000,
});
const bench = player({
  player_id: "00-bench",
  player_dk_id: "dk-bench",
  display_name: "Below Min",
  fpts_dk_mean: 3,
  fpts_dk_sd: 5,
});

const players = [qb, wr1, checkdown, fade, bench];

const pairs: SlateCorr[] = [
  { player_id_a: "00-qb", player_id_b: "00-wr1", corr_dk: 0.4 },
  { player_id_a: "00-qb", player_id_b: "00-rb", corr_dk: 0.45 },
  { player_id_a: "00-wr1", player_id_b: "00-qb", corr_dk: 0.4 },
  { player_id_a: "00-qb", player_id_b: "LAC_DST", corr_dk: -0.35 },
  { player_id_a: "00-qb", player_id_b: "00-bench", corr_dk: 0.5 },
];

describe("slateCorrIds", () => {
  it("drops numeric DraftKings fallbacks", () => {
    expect(
      slateCorrIds([
        qb,
        player({ player_id: "31164081", display_name: "Miss", player_dk_id: "31164081" }),
        fade,
      ]),
    ).toEqual(["00-qb", "LAC_DST"]);
  });
});

describe("stackSuggestions", () => {
  it("resolves a partner stored only as player_id_b", () => {
    const oneWay: SlateCorr[] = [{ player_id_a: "00-wr1", player_id_b: "00-qb", corr_dk: 0.4 }];
    const { positive } = stackSuggestions(players, oneWay, ["dk-qb"], [], []);
    expect(positive.map((p) => p.player_id)).toEqual(["00-wr1"]);
  });

  it("ranks by corr × sd, not raw corr or corr × proj", () => {
    const { positive } = stackSuggestions(players, pairs, ["dk-qb"], [], []);
    expect(positive.map((p) => p.name)).toEqual(["Rashee Rice", "Checkdown Back"]);
    expect(positive[0]!.score).toBeCloseTo(0.4 * 8);
    expect(positive[1]!.score).toBeCloseTo(0.45 * 3);
  });

  it("does not use corr × proj as the rank", () => {
    const highProjMild: SlateCorr[] = [
      { player_id_a: "00-qb", player_id_b: "00-rb", corr_dk: 0.15 },
      { player_id_a: "00-qb", player_id_b: "00-wr1", corr_dk: 0.4 },
    ];
    const sameSd = [
      { ...checkdown, fpts_dk_mean: 20, fpts_dk_sd: 6 },
      { ...wr1, fpts_dk_mean: 7, fpts_dk_sd: 6 },
      qb,
    ];
    const { positive } = stackSuggestions(sameSd, highProjMild, ["dk-qb"], [], []);
    expect(positive[0]!.name).toBe("Rashee Rice");
  });

  it("drops excluded, out-of-pool, already locked, already stacked, and missing sd", () => {
    const noSd = { ...wr1, fpts_dk_sd: null };
    const { positive } = stackSuggestions(
      [qb, noSd, checkdown, fade, bench],
      pairs,
      ["dk-qb"],
      ["dk-rb"],
      [],
    );
    expect(positive.map((p) => p.player_id)).toEqual([]);
  });

  it("names the lock each partner is anchored to", () => {
    const wrLock = { ...wr1, player_dk_id: "dk-wr1" };
    const { positive } = stackSuggestions(
      [qb, wrLock, checkdown],
      [
        { player_id_a: "00-qb", player_id_b: "00-rb", corr_dk: 0.2 },
        { player_id_a: "00-wr1", player_id_b: "00-rb", corr_dk: 0.5 },
      ],
      ["dk-qb", "dk-wr1"],
      [],
      [],
    );
    expect(positive).toHaveLength(1);
    expect(positive[0]!.anchorName).toBe("Rashee Rice");
    expect(positive[0]!.anchorId).toBe("dk-wr1");
  });

  it("keeps negatives in their own list ranked by most negative co-movement", () => {
    const mild = player({
      player_id: "00-mild",
      player_dk_id: "dk-mild",
      display_name: "High Proj Mild Neg",
      fpts_dk_mean: 20,
      fpts_dk_sd: 5,
    });
    const { negative, positive } = stackSuggestions(
      [qb, wr1, fade, mild],
      [
        { player_id_a: "00-qb", player_id_b: "LAC_DST", corr_dk: -0.35 },
        { player_id_a: "00-qb", player_id_b: "00-mild", corr_dk: -0.1 },
        { player_id_a: "00-qb", player_id_b: "00-wr1", corr_dk: 0.4 },
      ],
      ["dk-qb"],
      [],
      [],
    );
    expect(positive.map((p) => p.name)).toEqual(["Rashee Rice"]);
    expect(negative.map((p) => p.name)).toEqual(["Chargers", "High Proj Mild Neg"]);
    expect(negative[0]!.score).toBeLessThan(negative[1]!.score);
  });
});
