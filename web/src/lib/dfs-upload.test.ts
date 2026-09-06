import { formatUploadCsv } from "@/lib/dfs-upload";
import type { DfsLineup } from "@/lib/types";

const SAMPLE: DfsLineup = {
  lineup_id: "0",
  salary_used: 50000,
  stack: "DET 3",
  proj_fpts: 140.1,
  sim_win_pct: 0.12,
  sim_roi: 0.4,
  players: [
    { slot: "QB", name: "Jahmyr Gibbs", dk_id: "111" },
    { slot: "RB", name: "Saquon Barkley", dk_id: "222" },
    { slot: "RB2", name: "Bijan Robinson", dk_id: "333" },
    { slot: "WR", name: "Ja'Marr Chase", dk_id: "444" },
    { slot: "WR2", name: "Amon-Ra St. Brown", dk_id: "555" },
    { slot: "WR3", name: "Puka Nacua", dk_id: "666" },
    { slot: "TE", name: "Sam LaPorta", dk_id: "777" },
    { slot: "FLEX", name: "Justin Jefferson", dk_id: "888" },
    { slot: "DST", name: "Rams", dk_id: "999" },
  ],
};

describe("formatUploadCsv", () => {
  it("stamps run_id and keeps this slate's IDs", () => {
    const text = formatUploadCsv("abc-run", "2026_01_full", [SAMPLE]);
    expect(text).toContain("abc-run");
    expect(text).toContain("2026_01_full");
    expect(text).toContain("666");
    expect(text).not.toContain("0001");
  });
});
