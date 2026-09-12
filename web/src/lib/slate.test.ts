import { parseGameInfo, requestedSlate, resolveSlate, slateHref, slateKey } from "@/lib/slate";
import { PRESERVED_PARAMS, parseTableState, tableStateToParams } from "@/lib/table-state";

describe("parseGameInfo", () => {
  it("parses AWAY@HOME date time ET", () => {
    expect(parseGameInfo("KC@LAC 09/13/2026 01:00PM ET")).toEqual({ away: "KC", home: "LAC" });
  });

  it("maps LAR to LA", () => {
    expect(parseGameInfo("LAR@SF 09/13/2026 04:25PM ET")).toEqual({ away: "LA", home: "SF" });
  });

  it("maps JAC and WSH", () => {
    expect(parseGameInfo("JAC@WSH 09/14/2026 08:15PM ET")).toEqual({ away: "JAX", home: "WAS" });
  });

  it("returns null for empty or malformed", () => {
    expect(parseGameInfo("")).toBeNull();
    expect(parseGameInfo("Chiefs vs Chargers")).toBeNull();
    expect(parseGameInfo(null)).toBeNull();
  });
});

describe("slateKey", () => {
  it("returns the suffix after season_week", () => {
    expect(slateKey("2026_01_main")).toBe("main");
    expect(slateKey("2026_01_full")).toBe("full");
    expect(slateKey("2026_12_showdown")).toBe("showdown");
  });

  it("passes through an already-short key", () => {
    expect(slateKey("main")).toBe("main");
  });
});

describe("resolveSlate", () => {
  it("keeps an ingested slate", () => {
    expect(resolveSlate("full", ["main", "full"])).toEqual({ slate: "full", fallback: false });
  });

  it("falls back to main when unknown", () => {
    expect(resolveSlate("nope", ["main", "full"])).toEqual({ slate: "main", fallback: true });
  });

  it("falls back to main when requested is empty", () => {
    expect(resolveSlate("", ["main"])).toEqual({ slate: "main", fallback: true });
  });
});

describe("requestedSlate", () => {
  it("path wins when both are present", () => {
    expect(requestedSlate("full", "main")).toBe("full");
  });

  it("uses query when path is absent", () => {
    expect(requestedSlate(undefined, "showdown")).toBe("showdown");
  });

  it("defaults to main", () => {
    expect(requestedSlate(undefined, undefined)).toBe("main");
  });
});

describe("slateHref", () => {
  it("builds path slates and games query", () => {
    expect(slateHref({ page: "players", week: 1, site: "dk", slate: "full" })).toBe(
      "/week/1/players/dk/full",
    );
    expect(slateHref({ page: "dfs", week: 1, site: "dk", slate: "main" })).toBe("/week/1/dfs/dk/main");
    expect(slateHref({ page: "optimize", week: 2, site: "dk", slate: "showdown" })).toBe(
      "/week/2/optimize/dk/showdown",
    );
    expect(slateHref({ page: "games", week: 1, site: "dk", slate: "full" })).toBe(
      "/week/1/games?slate=full",
    );
  });
});

describe("PRESERVED_PARAMS", () => {
  it("keeps slate when table state writes sort", () => {
    expect(PRESERVED_PARAMS).toContain("slate");
    const base = new URLSearchParams("slate=full&run=abc&season=2026");
    const next = tableStateToParams({ ...parseTableState(base), sort: "proj", dir: "asc" }, base);
    expect(next.get("slate")).toBe("full");
    expect(next.get("run")).toBe("abc");
  });
});
