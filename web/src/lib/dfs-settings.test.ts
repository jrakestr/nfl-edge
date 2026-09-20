import { settingsFromLineup, settingsLabels } from "./dfs-settings";

describe("settingsLabels", () => {
  it("uses em dashes when a run stored no settings", () => {
    expect(settingsLabels(null)).toEqual([
      "Randomness —",
      "Stacks % —",
      "Max exposure —",
    ]);
  });

  it("prints the values this build used", () => {
    expect(settingsLabels({ randomness: 25, stacksPct: 65, maxExposure: 40 })).toEqual([
      "Randomness 25",
      "Stacks 65%",
      "Max exposure 40%",
    ]);
  });
});

describe("settingsFromLineup", () => {
  it("reads the persisted snake_case payload", () => {
    expect(
      settingsFromLineup({
        players: [],
        settings: { randomness: 25, stacks_pct: 65, max_exposure: 40, num_uniques: 3 },
      }),
    ).toEqual({ randomness: 25, stacksPct: 65, maxExposure: 40, numUniques: 3 });
  });

  it("returns null when settings are missing", () => {
    expect(settingsFromLineup({ players: [] })).toBeNull();
  });
});
