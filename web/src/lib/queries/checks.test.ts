import { formatFailedLine, groupFailedChecks, statusFor, type RawCheck } from "./checks";
import type { GameChecks } from "@/lib/types";

function row(over: Partial<RawCheck> & Pick<RawCheck, "check_name" | "passed">): RawCheck {
  return {
    game_id: "2026_01_BAL_IND",
    severity: "warning",
    value: null,
    threshold: null,
    team: null,
    ...over,
  };
}

describe("statusFor", () => {
  it("returns ok with empty failed lists when every row passed", () => {
    const out = statusFor([row({ check_name: "td_sum", severity: "invariant", passed: true, value: 1, threshold: 1 })]);
    expect(out).toEqual({ status: "ok", failed: [], failedRows: [] });
  });

  it("keeps value and threshold on a failed warning", () => {
    const out = statusFor([
      row({ check_name: "spread_gap_vs_market", passed: false, value: 7.5, threshold: 4, severity: "warning" }),
    ]);
    expect(out.status).toBe("warn");
    expect(out.failed).toEqual(["spread_gap_vs_market"]);
    expect(out.failedRows).toEqual([
      { check_name: "spread_gap_vs_market", value: 7.5, threshold: 4, team: null, severity: "warning" },
    ]);
  });

  it("lists invariant failures before warnings and keeps a row per team", () => {
    const out = statusFor([
      row({ check_name: "spread_gap_vs_market", passed: false, value: 7.5, threshold: 4 }),
      row({ check_name: "td_sum", severity: "invariant", passed: false, value: 0.9, threshold: 1, team: "BAL" }),
      row({ check_name: "td_sum", severity: "invariant", passed: false, value: 0.8, threshold: 1, team: "IND" }),
    ]);
    expect(out.status).toBe("fail");
    expect(out.failed).toEqual(["td_sum", "spread_gap_vs_market"]);
    expect(out.failedRows.map((r) => [r.check_name, r.team, r.value])).toEqual([
      ["td_sum", "BAL", 0.9],
      ["td_sum", "IND", 0.8],
      ["spread_gap_vs_market", null, 7.5],
    ]);
  });

  it("formats a game line with the run clock", () => {
    expect(
      formatFailedLine(
        "BAL",
        "IND",
        { check_name: "spread_gap_vs_market", value: 7.5, threshold: 4, team: null, severity: "warning" },
        "2026-09-12T18:00:00.000Z",
      ),
    ).toBe("BAL@IND 7.5 (limit 4.0) · at run Sat 14:00");
  });

  it("groups failed rows by check, invariants first, larger gap first", () => {
    const checks: Record<string, GameChecks> = {
      "2026_01_BAL_IND": {
        game_id: "2026_01_BAL_IND",
        status: "warn",
        failed: ["spread_gap_vs_market"],
        failedRows: [
          { check_name: "spread_gap_vs_market", value: 7.5, threshold: 4, team: null, severity: "warning" },
        ],
        invariants: 0,
        warnings: 1,
      },
      "2026_01_MIA_LV": {
        game_id: "2026_01_MIA_LV",
        status: "fail",
        failed: ["td_sum", "spread_gap_vs_market"],
        failedRows: [
          { check_name: "td_sum", value: 0.9, threshold: 1, team: "MIA", severity: "invariant" },
          { check_name: "spread_gap_vs_market", value: 9.5, threshold: 4, team: null, severity: "warning" },
        ],
        invariants: 1,
        warnings: 1,
      },
    };
    const groups = groupFailedChecks(checks, [
      { game_id: "2026_01_BAL_IND", away: "BAL", home: "IND" },
      { game_id: "2026_01_MIA_LV", away: "MIA", home: "LV" },
    ]);
    expect(groups.map((g) => g.check_name)).toEqual(["td_sum", "spread_gap_vs_market"]);
    expect(groups[1]!.items.map((i) => i.game_id)).toEqual(["2026_01_MIA_LV", "2026_01_BAL_IND"]);
  });

  it("coerces numeric strings from postgres", () => {
    const out = statusFor([
      row({
        check_name: "total_gap_vs_market",
        passed: false,
        value: "9.1" as unknown as number,
        threshold: "8" as unknown as number,
      }),
    ]);
    expect(out.failedRows[0]).toMatchObject({ value: 9.1, threshold: 8 });
  });
});
