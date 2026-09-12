import { statusFor, type RawCheck } from "./checks";

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
