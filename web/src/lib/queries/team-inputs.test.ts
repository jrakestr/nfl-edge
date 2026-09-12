import { inputsForMatchup, starterDiffers, type TeamInput } from "@/lib/team-input";

function row(over: Partial<TeamInput> = {}): TeamInput {
  return {
    team: "CLE",
    off_ppd_raw: 2.0,
    off_ppd_adj: 2.1,
    def_ppd_allowed: 2.2,
    drives_mean: 11,
    league_off_ppd: 2.13,
    league_def_ppd_allowed: 2.13,
    qb_starter_id: "Watson",
    qb_starter_name: "Deshaun Watson",
    qb_lookback_id: "Sanders",
    qb_lookback_name: "Joe Flacco",
    qb_lookback_att: 200,
    qb_starter_att: 0,
    qb_pass_factor: 1.13,
    ...over,
  };
}

describe("inputsForMatchup", () => {
  it("keeps only the two sides", () => {
    const cle = row();
    const mia = row({ team: "MIA" });
    expect(inputsForMatchup({ CLE: cle, MIA: mia, LV: row({ team: "LV" }) }, "MIA", "CLE")).toEqual({
      MIA: mia,
      CLE: cle,
    });
  });
});

describe("starterDiffers", () => {
  it("is true only when both ids exist and are not the same player", () => {
    expect(starterDiffers(row())).toBe(true);
    expect(starterDiffers(row({ qb_lookback_id: "Watson" }))).toBe(false);
    expect(starterDiffers(row({ qb_lookback_id: null }))).toBe(false);
  });
});
