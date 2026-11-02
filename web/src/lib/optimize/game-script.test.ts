import { describe, expect, it, vi } from "vitest";
import { classicForcedInError } from "./classic";
import { applySolveControls, parseSolveControls } from "./controls-url";
import {
  describeActiveScripts,
  scriptAdjustedObjective,
  slateGamesFromPool,
  suggestGameStance,
} from "./game-script";
import { solveClassic, solveShowdown } from "./solve";
import { DEFAULT_CLASSIC, DEFAULT_SHOWDOWN, type OptPlayer } from "./types";

vi.mock("./glpk-load", async () => {
  const GLPK = (await import("glpk.js/node")).default;
  const api = await GLPK();
  return { getGlpk: async () => api };
});

function mk(
  id: string,
  name: string,
  position: OptPlayer["position"],
  team: string,
  opponent: string,
  gameId: string,
  homeAway: "home" | "away",
  salary: number,
  proj: number,
  marketTotal = 45.5,
  marketSpread = 3.0,
): OptPlayer {
  return {
    player_dk_id: id,
    name,
    position,
    team,
    opponent,
    game_id: gameId,
    homeAway,
    salary,
    proj,
    value: salary > 0 ? proj / (salary / 1000) : 0,
    proj_own: 0.1,
    p25: proj * 0.65,
    p90: proj * 1.45,
    marketTotal,
    marketSpread,
  };
}

const POOL: OptPlayer[] = [
  // Game 1: BAL @ BUF (shootout candidate: total 54.5)
  mk("allen", "Josh Allen", "QB", "BUF", "BAL", "2026_08_BAL_BUF", "home", 7700, 22.0, 54.5, 3.5),
  mk("lamar", "Lamar Jackson", "QB", "BAL", "BUF", "2026_08_BAL_BUF", "away", 7500, 21.5, 54.5, 3.5),
  mk("cook", "James Cook", "RB", "BUF", "BAL", "2026_08_BAL_BUF", "home", 6800, 14.5, 54.5, 3.5),
  mk("henry", "Derrick Henry", "RB", "BAL", "BUF", "2026_08_BAL_BUF", "away", 7600, 16.5, 54.5, 3.5),
  mk("shakir", "Khalil Shakir", "WR", "BUF", "BAL", "2026_08_BAL_BUF", "home", 5400, 12.0, 54.5, 3.5),
  mk("coleman", "Keon Coleman", "WR", "BUF", "BAL", "2026_08_BAL_BUF", "home", 4900, 10.5, 54.5, 3.5),
  mk("zay", "Zay Flowers", "WR", "BAL", "BUF", "2026_08_BAL_BUF", "away", 6400, 14.0, 54.5, 3.5),
  mk("kincaid", "Dalton Kincaid", "TE", "BUF", "BAL", "2026_08_BAL_BUF", "home", 4700, 10.0, 54.5, 3.5),
  mk("andrews", "Mark Andrews", "TE", "BAL", "BUF", "2026_08_BAL_BUF", "away", 5000, 10.5, 54.5, 3.5),
  mk("buf_dst", "Bills", "DST", "BUF", "BAL", "2026_08_BAL_BUF", "home", 3100, 8.5, 54.5, 3.5),
  mk("bal_dst", "Ravens", "DST", "BAL", "BUF", "2026_08_BAL_BUF", "away", 3000, 8.0, 54.5, 3.5),

  // Game 2: TEN @ CIN (control candidate: CIN -12.5)
  mk("burrow", "Joe Burrow", "QB", "CIN", "TEN", "2026_08_TEN_CIN", "home", 7000, 23.0, 45.5, 12.5),
  mk("brown", "Chase Brown", "RB", "CIN", "TEN", "2026_08_TEN_CIN", "home", 6600, 15.0, 45.5, 12.5),
  mk("pollard", "Tony Pollard", "RB", "TEN", "CIN", "2026_08_TEN_CIN", "away", 5800, 15.5, 45.5, 12.5),
  mk("chase", "Ja'Marr Chase", "WR", "CIN", "TEN", "2026_08_TEN_CIN", "home", 8400, 19.0, 45.5, 12.5),
  mk("ridley", "Calvin Ridley", "WR", "TEN", "CIN", "2026_08_TEN_CIN", "away", 5200, 11.5, 45.5, 12.5),
  mk("cin_dst", "Bengals", "DST", "CIN", "TEN", "2026_08_TEN_CIN", "home", 3800, 7.5, 45.5, 12.5),

  // Game 3: CLE @ PIT (grind candidate: total 38.5)
  mk("rodgers", "Aaron Rodgers", "QB", "PIT", "CLE", "2026_08_CLE_PIT", "home", 5300, 15.5, 38.5, 3.5),
  mk("warren", "Jaylen Warren", "RB", "PIT", "CLE", "2026_08_CLE_PIT", "home", 5400, 12.5, 38.5, 3.5),
  mk("chubb", "Nick Chubb", "RB", "CLE", "PIT", "2026_08_CLE_PIT", "away", 5500, 12.0, 38.5, 3.5),
  mk("pickens", "George Pickens", "WR", "PIT", "CLE", "2026_08_CLE_PIT", "home", 6000, 13.5, 38.5, 3.5),
  mk("jeudy", "Jerry Jeudy", "WR", "CLE", "PIT", "2026_08_CLE_PIT", "away", 4800, 11.0, 38.5, 3.5),
  mk("njoku", "David Njoku", "TE", "CLE", "PIT", "2026_08_CLE_PIT", "away", 4200, 9.5, 38.5, 3.5),
  mk("pit_dst", "Steelers", "DST", "PIT", "CLE", "2026_08_CLE_PIT", "home", 3300, 7.0, 38.5, 3.5),
];

describe("game script builder", () => {
  it("extracts slate games and suggests shootout, control, and grind stances from lines", () => {
    const games = slateGamesFromPool(POOL);
    expect(games).toHaveLength(3);
    const byId = Object.fromEntries(games.map((g) => [g.gameId, suggestGameStance(g)]));
    expect(byId["2026_08_BAL_BUF"]).toEqual({
      gameId: "2026_08_BAL_BUF",
      script: "shootout",
      team: "BUF",
    });
    expect(byId["2026_08_TEN_CIN"]).toEqual({
      gameId: "2026_08_TEN_CIN",
      script: "control",
      team: "CIN",
    });
    expect(byId["2026_08_CLE_PIT"]).toEqual({
      gameId: "2026_08_CLE_PIT",
      script: "grind",
      team: null,
    });
  });

  it("enforces shootout stack (QB + 2 same-team WR/TE + 1 opp skill, no game DST) and control script (leading RB, no trailing RB)", async () => {
    const lineups = await solveClassic(POOL, {
      ...DEFAULT_CLASSIC,
      lineups: 2,
      minSalary: 0,
      gameScripts: [
        { gameId: "2026_08_BAL_BUF", script: "shootout", team: "BUF" },
        { gameId: "2026_08_TEN_CIN", script: "control", team: "CIN" },
        { gameId: "2026_08_CLE_PIT", script: "grind", team: null },
      ],
    });
    expect(lineups).toHaveLength(2);
    for (const lu of lineups) {
      const dkIds = new Set(lu.players.map((p) => p.dk_id));
      // Shootout BUF: Josh Allen is QB, at least 2 of Shakir/Coleman/Kincaid, at least 1 of Henry/Zay/Andrews, no BUF/BAL DST
      expect(dkIds.has("allen")).toBe(true);
      const bufPass = ["shakir", "coleman", "kincaid"].filter((id) => dkIds.has(id));
      expect(bufPass.length).toBeGreaterThanOrEqual(2);
      const balBring = ["henry", "zay", "andrews"].filter((id) => dkIds.has(id));
      expect(balBring.length).toBeGreaterThanOrEqual(1);
      expect(dkIds.has("buf_dst")).toBe(false);
      expect(dkIds.has("bal_dst")).toBe(false);

      // Control CIN: Chase Brown is in, trailing RB Tony Pollard is out
      expect(dkIds.has("brown")).toBe(true);
      expect(dkIds.has("pollard")).toBe(false);

      // Grind CLE@PIT: at most 2 players from CLE@PIT
      const grindCount = ["rodgers", "warren", "chubb", "pickens", "jeudy", "njoku", "pit_dst"].filter(
        (id) => dkIds.has(id),
      ).length;
      expect(grindCount).toBeLessThanOrEqual(2);
    }
  });

  it("rejects two shootout games in Classic with a clear message", () => {
    const msg = classicForcedInError(POOL, {
      ...DEFAULT_CLASSIC,
      gameScripts: [
        { gameId: "2026_08_BAL_BUF", script: "shootout", team: "BUF" },
        { gameId: "2026_08_TEN_CIN", script: "shootout", team: "CIN" },
      ],
    });
    expect(msg).toMatch(/2 shootout game stacks selected/);
  });

  it("tilts player objective along p25/p90 under shootout and control scripts", () => {
    const wr = POOL.find((p) => p.player_dk_id === "shakir")!;
    const dst = POOL.find((p) => p.player_dk_id === "buf_dst")!;
    const ctrl = {
      ...DEFAULT_CLASSIC,
      gameScripts: [{ gameId: "2026_08_BAL_BUF", script: "shootout" as const, team: "BUF" }],
    };
    expect(scriptAdjustedObjective(wr, wr.proj, ctrl, false)).toBeGreaterThan(wr.proj);
    expect(scriptAdjustedObjective(dst, dst.proj, ctrl, false)).toBeLessThan(dst.proj);
    expect(describeActiveScripts(ctrl, false)[0]).toMatch(/BAL @ BUF Shootout/);
  });

  it("scales the script tilt to the Adjusted center instead of shrinking it toward the sim p90", () => {
    const ctrl = {
      ...DEFAULT_CLASSIC,
      points: "adjusted" as const,
      gameScripts: [{ gameId: "2026_08_BAL_BUF", script: "shootout" as const, team: "BUF" }],
    };
    // Sim mean 10, p90 18. FantasyPros 18 → Adjusted 14. Under DK pts the gap is 8; naive
    // Adjusted would make it 4 and shrink the bump for the player both sources like.
    const sim = { ...POOL.find((p) => p.player_dk_id === "shakir")!, proj: 10, simProj: 10, p25: 6.5, p90: 18 };
    const adj = { ...sim, proj: 14 };
    const simBump = scriptAdjustedObjective(sim, sim.proj, { ...ctrl, points: "dk" }, false) - sim.proj;
    const adjBump = scriptAdjustedObjective(adj, adj.proj, ctrl, false) - adj.proj;
    expect(simBump).toBeCloseTo(0.35 * 8, 5);
    expect(adjBump).toBeCloseTo(0.35 * 8 * 1.4, 5);
    expect(adjBump).toBeGreaterThanOrEqual(simBump);
  });

  it("round-trips scripts and sdScript in URL search params", () => {
    const state = {
      ...DEFAULT_CLASSIC,
      lineups: 5,
      gameScripts: [
        { gameId: "2026_08_BAL_BUF", script: "shootout" as const, team: "BUF" },
        { gameId: "2026_08_CLE_PIT", script: "grind" as const },
      ],
    };
    const sp = applySolveControls(state, new URLSearchParams(), false);
    expect(sp.get("scripts")).toBe("2026_08_BAL_BUF:shootout:BUF,2026_08_CLE_PIT:grind");
    expect(parseSolveControls(sp, false)).toEqual(state);

    const sdState = {
      ...DEFAULT_SHOWDOWN,
      showdownScript: "home_control" as const,
    };
    const sdSp = applySolveControls(sdState, new URLSearchParams(), true);
    expect(sdSp.get("sdScript")).toBe("home_control");
    expect(parseSolveControls(sdSp, true)).toEqual(sdState);
  });

  it("enforces Showdown home_control script (4–5 home players)", async () => {
    const sdPool = POOL.filter((p) => p.game_id === "2026_08_BAL_BUF");
    const lineups = await solveShowdown(sdPool, {
      ...DEFAULT_SHOWDOWN,
      lineups: 1,
      salaryCap: 50000,
      showdownScript: "home_control",
    });
    expect(lineups).toHaveLength(1);
    const bufCount = lineups[0]!.players.filter((p) => p.team === "BUF").length;
    expect(bufCount).toBeGreaterThanOrEqual(4);
    expect(bufCount).toBeLessThanOrEqual(5);
  });
});
