import {
  filterGamesForSlate,
  navHref,
  parseGameInfo,
  pathContext,
  requestedSlate,
  resolveSlate,
  missingSlateNotice,
  slateGameCountLabel,
  slateHref,
  slateKey,
  withPickParams,
} from "@/lib/slate";
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
    expect(resolveSlate("afternoon", ["main", "full", "afternoon"])).toEqual({
      slate: "afternoon",
      missing: false,
    });
  });

  it("marks an unknown key missing without rewriting to main", () => {
    expect(resolveSlate("nope", ["main", "full"])).toEqual({ slate: "nope", missing: true });
  });

  it("marks empty requested missing as main when main is not ingested", () => {
    expect(resolveSlate("", ["full"])).toEqual({ slate: "main", missing: true });
  });

  it("keeps main when it is ingested", () => {
    expect(resolveSlate("main", ["main", "full"])).toEqual({ slate: "main", missing: false });
  });
});

describe("missingSlateNotice", () => {
  it("names the expected DK CSV", () => {
    expect(missingSlateNotice(2026, 1, "afternoon")).toBe(
      "Afternoon has no salaries loaded for this week. Expected data/dk/DKSalaries_2026_wk01_afternoon.csv.",
    );
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

  it("appends lock/excl/stack/showunproj/games and ignores other keys", () => {
    const search = new URLSearchParams(
      "lock=111&excl=222&q=Gibbs&stack=333&showunproj=1&games=2026_01_MIA_LV",
    );
    expect(slateHref({ page: "optimize", week: 1, site: "dk", slate: "main", search })).toBe(
      "/week/1/optimize/dk/main?lock=111&excl=222&stack=333&showunproj=1&games=2026_01_MIA_LV",
    );
    expect(withPickParams("/players", search)).toBe(
      "/players?lock=111&excl=222&stack=333&showunproj=1&games=2026_01_MIA_LV",
    );
  });
});

describe("filterGamesForSlate", () => {
  const rows = [
    { away: "KC", home: "LAC", game_id: "main-game" },
    { away: "BUF", home: "BAL", game_id: "full-only" },
  ];

  it("hides a Full-only game under Main", () => {
    const main = filterGamesForSlate(rows, ["KC@LAC 09/13/2026 01:00PM ET"]);
    expect(main.map((r) => r.game_id)).toEqual(["main-game"]);
    const full = filterGamesForSlate(rows, [
      "KC@LAC 09/13/2026 01:00PM ET",
      "BUF@BAL 09/13/2026 01:00PM ET",
    ]);
    expect(full.map((r) => r.game_id)).toEqual(["main-game", "full-only"]);
  });
});

describe("slateGameCountLabel", () => {
  it("reads 12 of 16", () => {
    expect(slateGameCountLabel(12, 16)).toBe("12 of 16 games on this slate.");
  });
});

describe("navHref", () => {
  const ctx = { week: 1, site: "dk", slate: "full" };

  it("keeps slate on Games, Lineups, Optimize", () => {
    expect(navHref("Games", ctx, "/games")).toBe("/week/1/games?slate=full");
    expect(navHref("Lineups", ctx, "/lineups")).toBe("/week/1/dfs/dk/full");
    expect(navHref("Optimize", ctx, "/optimize")).toBe("/week/1/optimize/dk/full");
    expect(navHref("Claims", ctx, "/week/1/claims")).toBe("/week/1/claims");
  });

  it("Players always goes to newest Main", () => {
    expect(navHref("Players", ctx, "/players")).toBe("/players");
  });

  it("falls back when not on a week route", () => {
    expect(navHref("Games", { week: null, site: "dk", slate: "full" }, "/games")).toBe("/games");
  });

  it("carries pick params on Optimize and Players", () => {
    const search = new URLSearchParams("lock=111&stack=333");
    expect(navHref("Optimize", ctx, "/optimize", search)).toBe(
      "/week/1/optimize/dk/full?lock=111&stack=333",
    );
    expect(navHref("Players", ctx, "/players", search)).toBe("/players?lock=111&stack=333");
  });
});

describe("pathContext", () => {
  it("reads slate from the players path", () => {
    expect(pathContext("/week/1/players/dk/full")).toEqual({ week: 1, site: "dk", slate: "full" });
  });

  it("reads slate from the games query", () => {
    expect(pathContext("/week/1/games", "showdown")).toEqual({
      week: 1,
      site: "dk",
      slate: "showdown",
    });
  });
});

describe("PRESERVED_PARAMS", () => {
  it("keeps slate and pick keys when table state writes sort", () => {
    expect(PRESERVED_PARAMS).toEqual(
      expect.arrayContaining(["slate", "lock", "excl", "stack", "flexTE", "stackN", "games"]),
    );
    const base = new URLSearchParams(
      "slate=full&run=abc&season=2026&lock=111&excl=222&stack=333&flexTE=0&stackN=1",
    );
    const next = tableStateToParams({ ...parseTableState(base), sort: "proj", dir: "asc" }, base);
    expect(next.get("slate")).toBe("full");
    expect(next.get("run")).toBe("abc");
    expect(next.get("lock")).toBe("111");
    expect(next.get("excl")).toBe("222");
    expect(next.get("stack")).toBe("333");
    expect(next.get("flexTE")).toBe("0");
    expect(next.get("stackN")).toBe("1");
  });
});
