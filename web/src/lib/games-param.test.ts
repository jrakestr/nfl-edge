import { describe, expect, it } from "vitest";
import {
  applyGamesToParams,
  parseGames,
  selectedOnSlate,
  serializeGames,
  toggleGame,
  toggleWindow,
} from "./games-param";

describe("parseGames / serializeGames", () => {
  it("parses, uniques, and sorts", () => {
    expect(parseGames("2026_01_MIA_LV,2026_01_BAL_IND")).toEqual([
      "2026_01_BAL_IND",
      "2026_01_MIA_LV",
    ]);
    expect(parseGames(" 2026_01_MIA_LV,2026_01_MIA_LV, ")).toEqual(["2026_01_MIA_LV"]);
  });

  it("treats empty as no selection", () => {
    expect(parseGames("")).toEqual([]);
    expect(parseGames(null)).toEqual([]);
    expect(serializeGames([])).toBe("");
  });

  it("serializes canonically so the same set is the same URL", () => {
    expect(serializeGames(["2026_01_MIA_LV", "2026_01_BAL_IND"])).toBe(
      "2026_01_BAL_IND,2026_01_MIA_LV",
    );
  });
});

describe("toggleGame", () => {
  it("adds and removes while keeping sort", () => {
    expect(toggleGame([], "2026_01_MIA_LV")).toEqual(["2026_01_MIA_LV"]);
    expect(toggleGame(["2026_01_MIA_LV"], "2026_01_BAL_IND")).toEqual([
      "2026_01_BAL_IND",
      "2026_01_MIA_LV",
    ]);
    expect(toggleGame(["2026_01_BAL_IND", "2026_01_MIA_LV"], "2026_01_MIA_LV")).toEqual([
      "2026_01_BAL_IND",
    ]);
  });
});

describe("toggleWindow", () => {
  const windowIds = ["2026_01_KC_LAC", "2026_01_BUF_BAL"];

  it("selects every game in the window", () => {
    expect(toggleWindow(["2026_01_MIA_LV"], windowIds)).toEqual([
      "2026_01_BUF_BAL",
      "2026_01_KC_LAC",
      "2026_01_MIA_LV",
    ]);
  });

  it("deselects the window when all of it is already selected", () => {
    expect(toggleWindow(["2026_01_BUF_BAL", "2026_01_KC_LAC", "2026_01_MIA_LV"], windowIds)).toEqual([
      "2026_01_MIA_LV",
    ]);
  });
});

describe("selectedOnSlate", () => {
  it("keeps only ids that are on the visible slate", () => {
    expect(
      selectedOnSlate(["2026_01_MIA_LV", "2026_01_BAL_IND"], ["2026_01_MIA_LV"]),
    ).toEqual(["2026_01_MIA_LV"]);
    expect(selectedOnSlate(["2026_01_MIA_LV"], ["2026_01_BAL_IND"])).toEqual([]);
  });
});

describe("applyGamesToParams", () => {
  it("sets games when selected and omits it when empty", () => {
    const on = applyGamesToParams(["2026_01_MIA_LV"], new URLSearchParams("slate=main"));
    expect(on.get("games")).toBe("2026_01_MIA_LV");
    expect(on.get("slate")).toBe("main");
    const off = applyGamesToParams([], on);
    expect(off.has("games")).toBe(false);
  });
});
