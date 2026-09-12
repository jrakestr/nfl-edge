import { inOptimizerPool, staleInjury, statusPill } from "./injury-status";

const RUN = "2026-09-12T03:00:00.000Z";
const BEFORE = "2026-09-12T02:59:00.000Z";
const AFTER = "2026-09-12T03:01:00.000Z";

describe("statusPill", () => {
  it("maps override status to OUT / D / Q", () => {
    expect(statusPill("out")).toBe("OUT");
    expect(statusPill("IR")).toBe("OUT");
    expect(statusPill("doubtful")).toBe("D");
    expect(statusPill("questionable")).toBe("Q");
    expect(statusPill("active")).toBeNull();
    expect(statusPill(null)).toBeNull();
  });
});

describe("staleInjury", () => {
  it("is true when out or doubtful postdates the run", () => {
    expect(staleInjury("out", AFTER, RUN)).toBe(true);
    expect(staleInjury("doubtful", AFTER, RUN)).toBe(true);
  });

  it("is false when the same status predates the run", () => {
    expect(staleInjury("out", BEFORE, RUN)).toBe(false);
    expect(staleInjury("doubtful", BEFORE, RUN)).toBe(false);
  });

  it("never greys questionable, even after the run", () => {
    expect(staleInjury("questionable", AFTER, RUN)).toBe(false);
    expect(statusPill("questionable")).toBe("Q");
  });
});

describe("inOptimizerPool", () => {
  it("excludes a stale out/doubtful player by default", () => {
    expect(inOptimizerPool("out", AFTER, RUN)).toBe(false);
    expect(inOptimizerPool("out", BEFORE, RUN)).toBe(true);
  });
});
