import { canonicalSearch } from "./search-canonical";
import {
  DEFAULT_TABLE_STATE,
  PRESERVED_PARAMS,
  TABLE_PARAMS,
  parseTableState,
  tableStateToParams,
  type TableState,
} from "./table-state";

function roundtrip(state: TableState, base = new URLSearchParams()): TableState {
  return parseTableState(tableStateToParams(state, base));
}

const NONEMPTY_BASE = new URLSearchParams(
  "sort=old&view=table&run=abc&q=pre&season=2026&min=3&flat=0&slot=late&density=compact&slate=main&lock=111&excl=222&stack=333&lineups=8&cap=50000&minSalary=40000&maxExp=40&maxTeam=3&rand=5&stackN=2&bringBack=1&noQbDst=0&flexRB=1&flexWR=1&flexTE=0&reqStack=0&games=2026_01_DET_NO",
);

describe("table-state roundtrip", () => {
  it.each([
    ["default", { ...DEFAULT_TABLE_STATE }],
    ["sort desc", { ...DEFAULT_TABLE_STATE, sort: "proj", dir: "desc" as const }],
    ["sort asc", { ...DEFAULT_TABLE_STATE, sort: "player", dir: "asc" as const }],
    ["dir asc without sort", { ...DEFAULT_TABLE_STATE, sort: null, dir: "asc" as const }],
    ["q", { ...DEFAULT_TABLE_STATE, q: "gibbs" }],
    ["pos", { ...DEFAULT_TABLE_STATE, pos: "RB" }],
    ["team", { ...DEFAULT_TABLE_STATE, team: "DET" }],
    ["game", { ...DEFAULT_TABLE_STATE, game: "2026_01_DET_NO" }],
    ["salMin", { ...DEFAULT_TABLE_STATE, salMin: "4000" }],
    ["salMax", { ...DEFAULT_TABLE_STATE, salMax: "8000" }],
    ["minProj", { ...DEFAULT_TABLE_STATE, minProj: "12.5" }],
    ["showunproj", { ...DEFAULT_TABLE_STATE, showunproj: "1" }],
    ["pool", { ...DEFAULT_TABLE_STATE, pool: "Waivers" }],
    ["health", { ...DEFAULT_TABLE_STATE, health: "OUT" }],
    [
      "all fields",
      {
        sort: "salary",
        dir: "asc" as const,
        q: "a",
        pos: "WR",
        team: "NO",
        game: "g1",
        salMin: "1",
        salMax: "9",
        minProj: "0.5",
        showunproj: "1",
        pool: "Waivers",
        health: "Q",
      },
    ],
  ] as const)("parse(apply(%s)) equals state", (_label, state) => {
    expect(roundtrip(state)).toEqual(state);
  });

  it("parse of empty params equals DEFAULT_TABLE_STATE", () => {
    expect(parseTableState(new URLSearchParams())).toEqual(DEFAULT_TABLE_STATE);
  });

  it("parse(apply(state, non-empty base)) equals state", () => {
    const state: TableState = { ...DEFAULT_TABLE_STATE, sort: "proj", dir: "asc", q: "gibbs" };
    expect(roundtrip(state, NONEMPTY_BASE)).toEqual(state);
  });

  it("apply is idempotent on a non-empty base", () => {
    const state: TableState = { ...DEFAULT_TABLE_STATE, sort: "proj", dir: "asc", q: "gibbs" };
    const once = tableStateToParams(state, NONEMPTY_BASE);
    const twice = tableStateToParams(state, once);
    expect(once.toString()).toBe(twice.toString());
  });

  it("apply(parse(live), live) matches live when compared canonically, not by raw toString", () => {
    const live = new URLSearchParams(
      "sort=proj&view=table&run=abc&dir=asc&q=gibbs&games=2026_01_DET_NO",
    );
    const applied = tableStateToParams(parseTableState(live), live);
    expect(applied.toString()).not.toBe(live.toString());
    expect(canonicalSearch(applied)).toBe(canonicalSearch(live));
  });

  it("showunproj is a table key, not a preserved board key", () => {
    expect(TABLE_PARAMS).toContain("showunproj");
    expect(PRESERVED_PARAMS).not.toContain("showunproj");
  });

  it("a non-empty base carrying every preserved param keeps them all after apply", () => {
    const base = new URLSearchParams();
    for (const k of PRESERVED_PARAMS) base.set(k, `keep-${k}`);
    base.set("sort", "old");
    const next = tableStateToParams({ ...DEFAULT_TABLE_STATE, sort: "proj", dir: "desc" }, base);
    for (const k of PRESERVED_PARAMS) {
      expect(next.get(k)).toBe(`keep-${k}`);
    }
    expect(next.get("sort")).toBe("proj");
  });
});
