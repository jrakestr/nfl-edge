import { formatUploadCsv } from "@/lib/dfs-upload";
import { DEFAULT_CLASSIC, DEFAULT_SHOWDOWN, type OptPlayer, type SolveControls } from "./types";
import { solveClassic, solveShowdown } from "./solve";

vi.mock("./glpk-load", async () => {
  const GLPK = (await import("glpk.js/node")).default;
  const api = await GLPK();
  return { getGlpk: async () => api };
});

function p(
  id: string,
  name: string,
  position: OptPlayer["position"],
  team: string,
  opponent: string,
  salary: number,
  proj: number,
): OptPlayer {
  return {
    player_dk_id: id,
    name,
    position,
    team,
    opponent,
    salary,
    proj,
    value: salary > 0 ? proj / (salary / 1000) : 0,
    proj_own: 0.1,
  };
}

/** Two-QB classic pool (~20). DET@NO and KC@LAC. */
const CLASSIC: OptPlayer[] = [
  p("gof", "Jared Goff", "QB", "DET", "NO", 6000, 20.0),
  p("mah", "Patrick Mahomes", "QB", "KC", "LAC", 7500, 22.0),
  p("gib", "Jahmyr Gibbs", "RB", "DET", "NO", 8000, 18.2),
  p("coo", "James Cook", "RB", "BUF", "BAL", 6800, 13.0),
  p("pac", "Isiah Pacheco", "RB", "KC", "LAC", 6400, 12.0),
  p("kam", "Alvin Kamara", "RB", "NO", "DET", 7000, 14.0),
  p("saq", "Saquon Barkley", "RB", "PHI", "DAL", 8200, 19.0),
  p("stb", "Amon-Ra St. Brown", "WR", "DET", "NO", 7800, 17.0),
  p("ola", "Chris Olave", "WR", "NO", "DET", 6200, 13.0),
  p("wor", "Xavier Worthy", "WR", "KC", "LAC", 5400, 11.0),
  p("all", "Keenan Allen", "WR", "LAC", "KC", 7100, 15.0),
  p("sha", "Khalil Shakir", "WR", "BUF", "BAL", 4800, 9.0),
  p("jam", "Jameson Williams", "WR", "DET", "NO", 5200, 10.0),
  p("jef", "Justin Jefferson", "WR", "MIN", "CHI", 8500, 16.0),
  p("lap", "Sam LaPorta", "TE", "DET", "NO", 5500, 12.0),
  p("kel", "Travis Kelce", "TE", "KC", "LAC", 5000, 11.0),
  p("goe", "Dallas Goedert", "TE", "PHI", "DAL", 4300, 8.0),
  p("and", "Mark Andrews", "TE", "BAL", "BUF", 3300, 7.5),
  p("moe", "D.J. Moore", "WR", "CHI", "MIN", 3900, 8.0),
  p("nos", "Saints", "DST", "NO", "DET", 3000, 8.0),
  p("lac", "Chargers", "DST", "LAC", "KC", 2800, 7.0),
  p("buf", "Bills", "DST", "BUF", "BAL", 3200, 9.0),
  p("phi", "Eagles", "DST", "PHI", "DAL", 3100, 8.0),
];

const CLASSIC_CTRL: SolveControls = {
  ...DEFAULT_CLASSIC,
  lineups: 5,
  stackN: 1,
  bringBack: 1,
  locks: ["gib", "stb"],
  excludes: ["jef"],
};

function ids(lu: { players: { dk_id: string }[] }): Set<string> {
  return new Set(lu.players.map((p) => p.dk_id));
}

function posOf(lu: { players: { slot: string; position: string }[] }, slot: string): string {
  return lu.players.find((p) => p.slot === slot)?.position ?? "";
}

describe("classic ILP", () => {
  it("locks two, excludes one, stacks + bring-back, 5 valid DK lineups", async () => {
    const lineups = await solveClassic(CLASSIC, CLASSIC_CTRL);
    expect(lineups).toHaveLength(5);
    for (const lu of lineups) {
      const set = ids(lu);
      expect(set.has("gib")).toBe(true);
      expect(set.has("stb")).toBe(true);
      expect(set.has("jef")).toBe(false);
      expect(lu.players).toHaveLength(9);
      expect(lu.salary_used).toBeGreaterThanOrEqual(49200);
      expect(lu.salary_used).toBeLessThanOrEqual(50000);
      expect(posOf(lu, "QB")).toBe("QB");
      expect(posOf(lu, "DST")).toBe("DST");
      expect(["RB", "WR", "TE"]).toContain(posOf(lu, "FLEX"));
      const qb = lu.players.find((p) => p.slot === "QB")!;
      const wrte = lu.players.filter((p) => p.team === qb.team && (p.position === "WR" || p.position === "TE"));
      expect(wrte.length).toBeGreaterThanOrEqual(1);
      const opp = CLASSIC.find((p) => p.player_dk_id === qb.dk_id)!.opponent;
      const bring = lu.players.filter((p) => p.team === opp && p.position !== "DST");
      expect(bring.length).toBeGreaterThanOrEqual(1);
      expect(lu.players.some((p) => p.position === "DST" && p.team === opp)).toBe(false);
    }
    for (let i = 0; i < lineups.length; i++) {
      for (let j = i + 1; j < lineups.length; j++) {
        const a = ids(lineups[i]!);
        const shared = [...ids(lineups[j]!)].filter((id) => a.has(id)).length;
        expect(shared).toBeLessThanOrEqual(6);
      }
    }
    const csv = formatUploadCsv("run-1", "2026_01_main", lineupsToDfs(lineups), "user-optimized");
    for (const lu of lineups) {
      for (const pl of lu.players) expect(csv).toContain(pl.dk_id);
    }
    expect(csv).toContain("source=user-optimized");
  });

  it("stack, bring-back, and no-QB-vs-DST follow whichever QB is chosen", async () => {
    const det = await solveClassic(CLASSIC, {
      ...DEFAULT_CLASSIC,
      stackN: 1,
      bringBack: 1,
      locks: ["gof"],
      excludes: ["jef"],
    });
    expect(det).toHaveLength(1);
    const detIds = ids(det[0]!);
    expect(detIds.has("gof")).toBe(true);
    expect(
      det[0]!.players.some((pl) => pl.team === "DET" && (pl.position === "WR" || pl.position === "TE")),
    ).toBe(true);
    expect(det[0]!.players.some((pl) => pl.team === "NO" && pl.position !== "DST")).toBe(true);
    expect(det[0]!.players.some((pl) => pl.dk_id === "nos")).toBe(false);

    const kc = await solveClassic(CLASSIC, {
      ...DEFAULT_CLASSIC,
      stackN: 1,
      bringBack: 1,
      locks: ["mah"],
      excludes: ["jef"],
    });
    expect(kc).toHaveLength(1);
    expect(ids(kc[0]!).has("mah")).toBe(true);
    expect(
      kc[0]!.players.some((pl) => pl.team === "KC" && (pl.position === "WR" || pl.position === "TE")),
    ).toBe(true);
    expect(kc[0]!.players.some((pl) => pl.team === "LAC" && pl.position !== "DST")).toBe(true);
    expect(kc[0]!.players.some((pl) => pl.dk_id === "lac")).toBe(false);
  });
});

const SHOWDOWN: OptPlayer[] = [
  p("star", "Star", "WR", "SEA", "NE", 10000, 30),
  p("cheap", "Cheap", "QB", "SEA", "NE", 6000, 20),
  p("a", "A", "RB", "SEA", "NE", 8000, 12),
  p("b", "B", "WR", "NE", "SEA", 8000, 11),
  p("c", "C", "TE", "SEA", "NE", 8000, 10),
  p("d", "D", "RB", "NE", "SEA", 8000, 9),
  p("e", "E", "WR", "SEA", "NE", 8000, 8),
];

describe("showdown ILP", () => {
  it("CPT salary is 1.5× so the expensive star cannot captain a 50k lineup", async () => {
    const lineups = await solveShowdown(SHOWDOWN, { ...DEFAULT_SHOWDOWN, salaryCap: 50000, lineups: 1 });
    expect(lineups).toHaveLength(1);
    const cpt = lineups[0]!.players.find((pl) => pl.slot === "CPT")!;
    expect(cpt.dk_id).toBe("cheap");
    expect(cpt.dk_id).not.toBe("star");
    const flexIds = lineups[0]!.players.filter((pl) => pl.slot.startsWith("FLEX")).map((pl) => pl.dk_id);
    expect(flexIds).not.toContain(cpt.dk_id);
    expect(lineups[0]!.salary_used).toBeLessThanOrEqual(50000);
    // 1.5*6000 + 5*8000 = 49000. Star CPT would be 15000+40000=55000.
    expect(lineups[0]!.salary_used).toBe(49000);
  });

  it("CPT player is never also FLEX", async () => {
    const lineups = await solveShowdown(SHOWDOWN, { ...DEFAULT_SHOWDOWN, salaryCap: 50000, lineups: 1 });
    const idsIn = lineups[0]!.players.map((pl) => pl.dk_id);
    expect(new Set(idsIn).size).toBe(6);
  });
});

function lineupsToDfs(lineups: { lineup_id: string; salary_used: number; stack: string | null; proj_fpts: number; players: { slot: string; name: string; dk_id: string }[] }[]) {
  return lineups.map((lu) => ({
    lineup_id: lu.lineup_id,
    salary_used: lu.salary_used,
    stack: lu.stack,
    proj_fpts: lu.proj_fpts,
    sim_win_pct: null,
    sim_roi: null,
    players: lu.players.map((p) => ({ slot: p.slot, name: p.name, dk_id: p.dk_id })),
  }));
}
