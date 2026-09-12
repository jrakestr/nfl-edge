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

const SHOWDOWN: DfsLineup = {
  lineup_id: "0",
  salary_used: 49800,
  stack: "SEA 4",
  proj_fpts: 90.1,
  sim_win_pct: 0.18,
  sim_roi: 0.22,
  players: [
    { slot: "CPT", name: "Jaxon Smith-Njigba", dk_id: "43782097" },
    { slot: "FLEX", name: "Drake Maye", dk_id: "43782035" },
    { slot: "FLEX2", name: "A.J. Brown", dk_id: "43782036" },
    { slot: "FLEX3", name: "Sam Darnold", dk_id: "43782037" },
    { slot: "FLEX4", name: "Rhamondre Stevenson", dk_id: "43782038" },
    { slot: "FLEX5", name: "Seahawks", dk_id: "43782050" },
  ],
};

describe("formatUploadCsv", () => {
  it("stamps run_id, slate_id, and source=sim by default", () => {
    const text = formatUploadCsv("abc-run", "2026_01_full", [SAMPLE]);
    expect(text).toContain("run_id=abc-run");
    expect(text).toContain("slate_id=2026_01_full");
    expect(text).toContain("source=sim");
    expect(text).toContain("666");
    expect(text).not.toContain("0001");
  });

  it("stamps source=user-optimized for browser solves", () => {
    const text = formatUploadCsv("abc-run", "2026_01_main", [SAMPLE], "user-optimized");
    expect(text.split("\n")[0]).toBe(
      "# nfl-edge run_id=abc-run slate_id=2026_01_main source=user-optimized",
    );
  });

  it("uses the CPT header for showdown lineups", () => {
    const text = formatUploadCsv("run-sd", "2026_01_showdown", [SHOWDOWN]);
    expect(text.split("\n")[1]).toBe("CPT,FLEX,FLEX,FLEX,FLEX,FLEX");
    expect(text).toContain("43782097");
    expect(text).not.toContain("QB,RB,RB");
  });
});
