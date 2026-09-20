import { describe, expect, it } from "vitest";
import { compileFilters, type FilterTokens } from "./compile-filters";
import type { OptPlayer } from "./types";

function p(partial: Partial<OptPlayer> & Pick<OptPlayer, "player_dk_id" | "name" | "team">): OptPlayer {
  return {
    position: "WR",
    opponent: "DAL",
    salary: 5000,
    proj: 12,
    value: 2,
    proj_own: 0.1,
    p25: 8,
    p90: 16,
    kickoffWindow: "afternoon",
    elevated: false,
    homeAway: "home",
    marketTotal: 50,
    marketSpread: -3,
    ...partial,
  };
}

const pool: OptPlayer[] = [
  p({ player_dk_id: "1", name: "A", team: "DET", position: "QB", kickoffWindow: "afternoon", opponent: "KC" }),
  p({ player_dk_id: "2", name: "B", team: "DET", position: "WR", kickoffWindow: "afternoon", opponent: "KC" }),
  p({ player_dk_id: "3", name: "C", team: "KC", position: "QB", kickoffWindow: "early", opponent: "DET" }),
  p({ player_dk_id: "4", name: "D", team: "BUF", position: "RB", kickoffWindow: "primetime", salary: 3500 }),
  p({ player_dk_id: "5", name: "E", team: "CHI", position: "WR", kickoffWindow: "afternoon", elevated: true }),
];

const valuePool: OptPlayer[] = [
  p({ player_dk_id: "qb1", name: "QB1", team: "DET", position: "QB", value: 5 }),
  p({ player_dk_id: "qb2", name: "QB2", team: "KC", position: "QB", value: 1 }),
  p({ player_dk_id: "rb1", name: "RB1", team: "DET", position: "RB", value: 4 }),
  p({ player_dk_id: "rb2", name: "RB2", team: "BUF", position: "RB", value: 3.5 }),
  p({ player_dk_id: "rb3", name: "RB3", team: "CHI", position: "RB", value: 1 }),
  p({ player_dk_id: "wr1", name: "WR1", team: "DET", position: "WR", value: 4.5 }),
  p({ player_dk_id: "wr2", name: "WR2", team: "KC", position: "WR", value: 4 }),
  p({ player_dk_id: "wr3", name: "WR3", team: "BUF", position: "WR", value: 3 }),
  p({ player_dk_id: "wr4", name: "WR4", team: "CHI", position: "WR", value: 0.5 }),
  p({ player_dk_id: "te1", name: "TE1", team: "DET", position: "TE", value: 3.2 }),
  p({ player_dk_id: "te2", name: "TE2", team: "KC", position: "TE", value: 2 }),
  p({ player_dk_id: "dst1", name: "DST1", team: "BUF", position: "DST", value: 2.5 }),
];

describe("compileFilters", () => {
  it("afternoon only excludes other windows", () => {
    const r = compileFilters(pool, { windows: ["afternoon"] });
    expect(r.excl).toEqual(expect.arrayContaining(["3", "4"]));
    expect(r.excl).not.toContain("1");
  });

  it("fades a game by excluding both teams", () => {
    const r = compileFilters(pool, { fadeTeams: ["KC"] });
    expect(r.excl).toEqual(expect.arrayContaining(["1", "2", "3"]));
  });

  it("player salary floor excludes cheap players without touching lineup minSalary", () => {
    const r = compileFilters(pool, { playerMinSalary: 4000 });
    expect(r.excl).toContain("4");
    expect(r.patch.minSalary).toBeUndefined();
  });

  it("elevated only keeps backups in good spots", () => {
    const r = compileFilters(pool, { elevatedOnly: true });
    expect(r.exclNames.some((n) => n.label.startsWith("E "))).toBe(false);
    expect(new Set(r.exclNames.map((n) => n.player_id)).size).toBe(r.exclNames.length);
    expect(r.excl).toContain("1");
  });

  it("returns a conflict when fewer than nine remain", () => {
    const r = compileFilters(pool, { windows: ["afternoon"], elevatedOnly: true, fadeTeams: ["DET", "CHI"] });
    expect(r.conflict).toMatch(/9/);
  });

  it("stack Detroit anchors the DET QB and fades other QBs", () => {
    const r = compileFilters(pool, { stackTeam: "DET", stackN: 2, bringBack: 1 });
    expect(r.stack).toEqual(["1"]);
    expect(r.excl).toContain("3");
    expect(r.patch).toEqual({ stackN: 2, bringBack: 1 });
  });

  it("passes questions through without guessing", () => {
    const tokens: FilterTokens = { questions: ["Did you mean the 4pm window or primetime?"] };
    const r = compileFilters(pool, tokens);
    expect(r.questions[0]).toMatch(/primetime/);
    expect(r.excl).toHaveLength(0);
  });

  it("compiles the afternoon-only five-lineup phrase", () => {
    const r = compileFilters(pool, { lineups: 5, windows: ["afternoon"] });
    expect(r.patch.lineups).toBe(5);
    expect(r.excl).toEqual(expect.arrayContaining(["3", "4"]));
    expect(r.excl).not.toContain("1");
  });

  it("lists a faded other-team QB once when stack also drops them", () => {
    const r = compileFilters(pool, { fadeTeams: ["KC"], stackTeam: "DET" });
    const labels = r.exclNames.filter((n) => n.label.startsWith("C "));
    expect(labels).toHaveLength(1);
    expect(r.excl).toContain("3");
  });

  it("stacks DET and keeps only elevated when both tokens fire", () => {
    const r = compileFilters(pool, { stackTeam: "DET", stackN: 2, elevatedOnly: true });
    expect(r.stack).toEqual(["1"]);
    expect(r.excl).toEqual(expect.arrayContaining(["1", "2", "3", "4"]));
    expect(r.excl).not.toContain("5");
  });
});

describe("compileFilters value", () => {
  it("minValue drops below-threshold players and names the shortfall", () => {
    const r = compileFilters(valuePool, { minValue: 3 });
    expect(r.excl).toEqual(expect.arrayContaining(["qb2", "rb3", "wr4", "te2", "dst1"]));
    expect(r.excl).not.toContain("qb1");
    expect(r.excl).not.toContain("wr1");
    expect(new Set(r.exclNames.map((n) => n.player_id)).size).toBe(r.exclNames.length);
    expect(r.conflict).toMatch(/7 players remain/);
  });

  it("minValue leaves a legal pool alone", () => {
    const r = compileFilters(valuePool, { minValue: 2 });
    expect(r.excl).toEqual(expect.arrayContaining(["qb2", "rb3", "wr4"]));
    expect(r.excl).toHaveLength(3);
    expect(r.conflict).toBeNull();
  });

  it("topValuePerPos keeps only the best at each position", () => {
    const r = compileFilters(valuePool, { topValuePerPos: 1 });
    expect(r.excl).toEqual(
      expect.arrayContaining(["qb2", "rb2", "rb3", "wr2", "wr3", "wr4", "te2"]),
    );
    expect(r.excl).not.toContain("qb1");
    expect(r.excl).not.toContain("rb1");
    expect(r.excl).not.toContain("wr1");
    expect(r.excl).not.toContain("te1");
    expect(r.excl).not.toContain("dst1");
    expect(r.conflict).toMatch(/9/);
  });

  it("topValuePerPos 2 keeps two deep at each position", () => {
    const r = compileFilters(valuePool, { topValuePerPos: 2 });
    expect(r.excl).toEqual(expect.arrayContaining(["rb3", "wr3", "wr4"]));
    expect(r.excl).toHaveLength(3);
    expect(r.conflict).toBeNull();
  });

  it("locks survive a value filter that would drop them", () => {
    const r = compileFilters(valuePool, { minValue: 3 }, { lock: ["qb2", "wr4"] });
    expect(r.excl).not.toContain("qb2");
    expect(r.excl).not.toContain("wr4");
    expect(r.excl).toContain("rb3");
    expect(r.conflict).toBeNull();
  });

  it("names the forced-QB conflict instead of dropping a locked QB", () => {
    const r = compileFilters(valuePool, { minValue: 2 }, { lock: ["qb1", "qb2"] });
    expect(r.excl).not.toContain("qb1");
    expect(r.excl).not.toContain("qb2");
    expect(r.conflict).toMatch(/quarterbacks/);
  });

  it("a required stack survives topValuePerPos", () => {
    const r = compileFilters(valuePool, { topValuePerPos: 1 }, { stack: ["wr3", "wr4"] });
    expect(r.excl).not.toContain("wr3");
    expect(r.excl).not.toContain("wr4");
    expect(r.excl).toContain("wr2");
  });

  it("a lone stack id is not exempt", () => {
    const r = compileFilters(valuePool, { minValue: 3 }, { stack: ["qb2"] });
    expect(r.excl).toContain("qb2");
  });

  it("sort tokens do not filter the pool", () => {
    const r = compileFilters(valuePool, { sortBy: "value", sortDir: "desc" });
    expect(r.excl).toHaveLength(0);
    expect(r.conflict).toBeNull();
  });

  it("minValue and topValuePerPos combine as a union", () => {
    const r = compileFilters(valuePool, { minValue: 4, topValuePerPos: 1 });
    expect(r.excl).not.toContain("qb1");
    expect(r.excl).not.toContain("rb1");
    expect(r.excl).not.toContain("wr1");
    expect(r.excl).toContain("wr2");
    expect(r.excl).toContain("te1");
    expect(r.excl).toContain("dst1");
  });
});
