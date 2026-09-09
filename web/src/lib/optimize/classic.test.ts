import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { applyExclude, applyLock, applyStack, parsePoolState, poolStateToParams } from "@/lib/pool-state";
import { dkIdsInCsv, exportBuiltLineups, optimizeClassic } from "@/lib/optimize/classic";
import { opponentOf, parseGameInfo } from "@/lib/optimize/game-info";
import { CHECKPOINT_B, DET_NO_SLATE, fixtureCsv } from "@/lib/optimize/week1-fixture";
import { PRESERVED_PARAMS, parseTableState, tableStateToParams } from "@/lib/table-state";

describe("pool-state", () => {
  it("lock and exclude are exclusive", () => {
    let s = parsePoolState(new URLSearchParams());
    s = applyLock(s, "gibbs");
    s = applyLock(s, "stbrown");
    expect(s.locked).toEqual(["gibbs", "stbrown"]);
    s = applyExclude(s, "gibbs");
    expect(s.locked).toEqual(["stbrown"]);
    expect(s.excluded).toEqual(["gibbs"]);
  });

  it("add-to-stack sets DET then NO bring-back", () => {
    let s = parsePoolState(new URLSearchParams());
    s = applyStack(s, "stbrown", "DET", "WR");
    expect(s.qbStackTeam).toBe("DET");
    expect(s.stacked).toEqual(["stbrown"]);
    s = applyStack(s, "olave", "NO", "WR");
    expect(s.bringBackTeam).toBe("NO");
  });

  it("round-trips through URL params without clobbering table keys", () => {
    const base = new URLSearchParams("sort=proj&q=gibbs&run=abc");
    const next = poolStateToParams(
      {
        locked: ["gibbs"],
        excluded: ["monty"],
        stacked: [],
        qbStackTeam: "DET",
        bringBackTeam: "NO",
        randomness: 20,
        maxExposure: 0.8,
        nLineups: 5,
        tab: "build",
      },
      base,
    );
    expect(next.get("lock")).toBe("gibbs");
    expect(next.get("x")).toBe("monty");
    expect(next.get("qb")).toBe("DET");
    expect(next.get("bb")).toBe("NO");
    expect(next.get("sort")).toBe("proj");
    expect(next.get("run")).toBe("abc");
  });
});

describe("table-state preserves pool keys", () => {
  it("sort write keeps lock and qb", () => {
    const base = new URLSearchParams("lock=gibbs&qb=DET&run=abc");
    const next = tableStateToParams({ ...parseTableState(base), sort: "salary", dir: "desc" }, base);
    for (const k of ["lock", "qb", "run"] as const) {
      expect(next.get(k)).toBe(base.get(k));
    }
    expect(PRESERVED_PARAMS).toContain("lock");
  });
});

describe("game-info", () => {
  it("parses NO@DET", () => {
    expect(parseGameInfo("NO@DET 09/07/2026 01:00PM ET")).toEqual({ away: "NO", home: "DET" });
    expect(opponentOf("NO@DET 09/07/2026 01:00PM ET", "DET")).toBe("NO");
    expect(opponentOf("NO@DET 09/07/2026 01:00PM ET", "NO")).toBe("DET");
  });
});

describe("Checkpoint B — Week 1 DK Main", () => {
  const result = optimizeClassic(DET_NO_SLATE, CHECKPOINT_B);

  it("builds 5 lineups around Gibbs and St. Brown", () => {
    expect(result.error).toBeNull();
    expect(result.lineups).toHaveLength(5);
  });

  it("locks, DET QB stack, one NO bring-back, excluded Montgomery", () => {
    for (const lu of result.lineups) {
      const ids = lu.players.map((p) => p.player_id);
      const names = lu.players.map((p) => p.name);
      expect(ids).toContain("gibbs");
      expect(ids).toContain("stbrown");
      expect(names).not.toContain("David Montgomery");
      const qb = lu.players.find((p) => p.slot === "QB");
      expect(qb?.name).toBe("Jared Goff");
      const teams = new Map<string, string>();
      for (const row of DET_NO_SLATE) teams.set(row.player_id, row.team ?? "");
      const detPass = lu.players.filter((p) => teams.get(p.player_id ?? "") === "DET" && p.slot !== "QB" && p.slot !== "DST" && p.slot !== "RB" && p.slot !== "RB2");
      const detWrTe = lu.players.filter((p) => {
        const row = DET_NO_SLATE.find((s) => s.player_id === p.player_id);
        return row?.team === "DET" && (row.position === "WR" || row.position === "TE");
      });
      expect(detWrTe.length).toBeGreaterThanOrEqual(2);
      const noBring = lu.players.filter((p) => {
        const row = DET_NO_SLATE.find((s) => s.player_id === p.player_id);
        return row?.team === "NO" && row.position !== "QB" && row.position !== "DST";
      });
      expect(noBring.length).toBeGreaterThanOrEqual(1);
      expect(lu.salary_used).toBeGreaterThanOrEqual(49200);
      expect(lu.salary_used).toBeLessThanOrEqual(50000);
      void detPass;
    }
  });

  it("lineups are unique and export uses this slate's DK IDs", () => {
    const keys = result.lineups.map((lu) =>
      lu.players
        .map((p) => p.dk_id)
        .sort()
        .join("|"),
    );
    expect(new Set(keys).size).toBe(5);
    const csv = exportBuiltLineups("run-b", "2026_01_main", result.lineups);
    expect(csv).toContain("run-b");
    expect(csv).toContain("2026_01_main");
    const slateIds = dkIdsInCsv(fixtureCsv(DET_NO_SLATE));
    expect(slateIds.get("jahmyr gibbs")).toBe("43791002");
    expect(slateIds.get("amon-ra st. brown")).toBe("43791004");
    expect(csv).toContain("43791002");
    expect(csv).toContain("43791004");
    for (const lu of result.lineups) {
      for (const p of lu.players) {
        expect(p.dk_id).toBeTruthy();
        const expected = slateIds.get(p.name.toLowerCase());
        expect(p.dk_id).toBe(expected);
      }
    }
  });

  it("real DK Main CSV IDs match when the file is present", () => {
    const path = resolve(process.cwd(), "..", "data/dk/DKSalaries_2026_wk01_main.csv");
    if (!existsSync(path)) {
      expect(existsSync(path)).toBe(false);
      return;
    }
    const ids = dkIdsInCsv(readFileSync(path, "utf8"));
    const csv = exportBuiltLineups("run-b", "2026_01_main", result.lineups);
    const gibbs = ids.get("jahmyr gibbs");
    const sun = ids.get("amon-ra st. brown");
    expect(gibbs).toBeTruthy();
    expect(sun).toBeTruthy();
    expect(csv.includes(`(${gibbs})`) || csv.includes(gibbs!)).toBe(true);
    expect(csv.includes(`(${sun})`) || csv.includes(sun!)).toBe(true);
  });
});
