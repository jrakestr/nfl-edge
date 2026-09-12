import {
  applyPicksToParams,
  emptyPicks,
  parsePicks,
  picksFromUrlOrStorage,
  slateStorageKey,
  storePicks,
  toggleExcl,
  toggleLock,
} from "./slate-picks";

describe("slate-picks", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("parses comma-separated ids", () => {
    expect(parsePicks(new URLSearchParams("lock=111,222&excl=333"))).toEqual({
      lock: ["111", "222"],
      excl: ["333"],
      stack: [],
    });
  });

  it("URL wins over localStorage when any pick param is present", () => {
    storePicks("2026_01_main", { lock: ["999"], excl: ["888"], stack: [] });
    expect(picksFromUrlOrStorage(new URLSearchParams("lock=111"), "2026_01_main")).toEqual({
      lock: ["111"],
      excl: [],
      stack: [],
    });
  });

  it("falls back to localStorage when the URL has no pick params", () => {
    storePicks("2026_01_main", { lock: ["999"], excl: [], stack: ["555"] });
    expect(picksFromUrlOrStorage(new URLSearchParams(), "2026_01_main")).toEqual({
      lock: ["999"],
      excl: [],
      stack: ["555"],
    });
  });

  it("lock and exclude are mutually exclusive", () => {
    const locked = toggleLock(emptyPicks(), "111");
    expect(locked.lock).toEqual(["111"]);
    const excluded = toggleExcl(locked, "111");
    expect(excluded.lock).toEqual([]);
    expect(excluded.excl).toEqual(["111"]);
  });

  it("writes pick params without dropping others", () => {
    const next = applyPicksToParams(
      { lock: ["111"], excl: [], stack: ["222"] },
      new URLSearchParams("run=abc&sort=proj"),
    );
    expect(next.get("lock")).toBe("111");
    expect(next.get("stack")).toBe("222");
    expect(next.get("excl")).toBeNull();
    expect(next.get("run")).toBe("abc");
    expect(next.get("sort")).toBe("proj");
  });

  it("uses the per-slate storage key", () => {
    expect(slateStorageKey("2026_01_main")).toBe("nfl-edge.slate:2026_01_main");
  });
});
