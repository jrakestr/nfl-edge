import {
  canRunFrom,
  dispatchInputs,
  formatDuration,
  latestByKey,
  looksLikeDkSalaries,
  salaryFileName,
  type WorkflowRun,
} from "./workflow";

function run(p: Partial<WorkflowRun>): WorkflowRun {
  return {
    id: 1, phase: "sim", week: 6, slate: null, status: "success",
    started_at: "2026-10-17T18:00:00Z", finished_at: "2026-10-17T18:01:19Z",
    message: null, host: "github", gh_run_url: null, ...p,
  };
}

describe("formatDuration", () => {
  it("seconds, minutes, hours", () => {
    expect(formatDuration("2026-10-17T18:00:00Z", "2026-10-17T18:00:48Z")).toBe("48 s");
    expect(formatDuration("2026-10-17T18:00:00Z", "2026-10-17T18:03:05Z")).toBe("3 m 05 s");
    expect(formatDuration("2026-10-17T18:00:00Z", "2026-10-17T19:02:00Z")).toBe("1 h 02 m");
  });

  it("a running row counts up to now", () => {
    expect(formatDuration("2026-10-17T18:00:00Z", null, new Date("2026-10-17T18:00:30Z"))).toBe("30 s");
  });
});

describe("latestByKey", () => {
  it("keeps the newest row per phase and per DFS slate", () => {
    const rows = [
      run({ id: 3, phase: "dfs", slate: "main" }),
      run({ id: 2, phase: "dfs", slate: "turbo" }),
      run({ id: 1, phase: "dfs", slate: "main" }),
      run({ id: 0, phase: "sim" }),
    ];
    const m = latestByKey(rows);
    expect(m.get("dfs:main")?.id).toBe(3);
    expect(m.get("dfs:turbo")?.id).toBe(2);
    expect(m.get("sim")?.id).toBe(0);
  });
});

describe("dispatchInputs", () => {
  it("builds string inputs for phase.yml", () => {
    expect(dispatchInputs({ phase: "sim", runFrom: true, week: 6 })).toEqual({
      ok: true,
      inputs: { phase: "sim", run_from: "true", slate: "", week: "6", draws: "", field_size: "", iterations: "" },
    });
  });

  it("rejects unknown phases, bad numbers and misplaced slates", () => {
    expect(dispatchInputs({ phase: "deploy" }).ok).toBe(false);
    expect(dispatchInputs({ phase: "sim", week: 0 }).ok).toBe(false);
    expect(dispatchInputs({ phase: "sim", draws: "lots" }).ok).toBe(false);
    expect(dispatchInputs({ phase: "lines", slate: "main" }).ok).toBe(false);
    expect(dispatchInputs({ phase: "dfs", slate: "main; rm" }).ok).toBe(false);
  });

  it("refresh and grade run alone", () => {
    expect(canRunFrom("refresh")).toBe(false);
    expect(canRunFrom("grade")).toBe(false);
    expect(dispatchInputs({ phase: "grade", runFrom: true }).ok).toBe(false);
  });
});

describe("salary files", () => {
  it("names the file the pipeline looks for", () => {
    expect(salaryFileName(2026, 6, "main")).toBe("DKSalaries_2026_wk06_main.csv");
  });

  it("accepts a DK export header, BOM included", () => {
    expect(looksLikeDkSalaries("﻿Position,Name + ID,Name,ID,Roster Position,Salary,Game Info,TeamAbbrev,AvgPointsPerGame\n")).toBe(true);
    expect(looksLikeDkSalaries("Name,Salary\n")).toBe(false);
  });
});
