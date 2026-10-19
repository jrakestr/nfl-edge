import { render, screen } from "@testing-library/react";
import { LineupCard } from "@/components/dfs/LineupCard";
import { gameMinLeft, lineupActual, type SlotActualInput } from "@/lib/lineup-actuals";
import type { DfsLineup } from "@/lib/types";

const lineup: DfsLineup = {
  lineup_id: "1",
  salary_used: 50000,
  stack: null,
  proj_fpts: 20,
  sim_win_pct: null,
  sim_roi: null,
  players: [
    { slot: "QB", name: "C.J. Stroud", dk_id: "a" },
    { slot: "DST", name: "Texans", dk_id: "b" },
  ],
};

function slot(over: Partial<SlotActualInput>): SlotActualInput {
  return { dkId: "a", playerId: "p", actual: null, ...over };
}

describe("lineupActual", () => {
  it("sums a final lineup, counts DNP as 0, and diffs against the projection", () => {
    const got = lineupActual(
      [
        slot({ actual: { pts: 18.4, state: "final", secsRemaining: 0 } }),
        slot({ dkId: "b", playerId: "HOU_DST", actual: { pts: null, state: "dnp", secsRemaining: 0 } }),
      ],
      20,
    );
    expect(got.total).toBeCloseTo(18.4);
    expect(got.finalCount).toBe(2);
    expect(got.diff).toBeCloseTo(-1.6);
    expect(got.maxSecs).toBeNull();
  });

  it("keeps a live total so far and the longer game clock", () => {
    const got = lineupActual(
      [
        slot({ actual: { pts: 4, state: "live", secsRemaining: 600 } }),
        slot({ dkId: "b", playerId: "HOU_DST", actual: { pts: null, state: "pending", secsRemaining: 3600 } }),
      ],
      20,
    );
    expect(got.total).toBeNull();
    expect(got.soFar).toBe(4);
    expect(got.finalCount).toBe(0);
    expect(got.maxSecs).toBe(3600);
    expect(got.anyLive).toBe(true);
    expect(gameMinLeft(600)).toBe("10");
  });

  it("shows no points for a game that has not started", () => {
    const got = lineupActual(
      [slot({ actual: { pts: null, state: "pending", secsRemaining: 3600 } })],
      10,
    );
    expect(got.soFar).toBeNull();
    expect(got.perSlot[0]?.label).toBe("\u2014");
    expect(gameMinLeft(got.maxSecs)).toBe("60");
  });

  it("does not turn an unmapped salary row into a zero", () => {
    const got = lineupActual(
      [
        slot({ actual: { pts: 10, state: "final", secsRemaining: 0 } }),
        slot({ dkId: "b", playerId: null, actual: null }),
      ],
      20,
    );
    expect(got.incomplete).toBe(true);
    expect(got.total).toBeNull();
    expect(got.soFar).toBeNull();
  });
});

describe("LineupCard actuals", () => {
  it("renders final points, DNP, a live clock, and an unmapped dash", () => {
    const actual = lineupActual(
      [
        slot({ dkId: "a", actual: { pts: 12.5, state: "final", secsRemaining: 0 } }),
        slot({ dkId: "b", playerId: null, actual: null }),
      ],
      20,
    );
    render(<LineupCard lineup={lineup} actual={actual} />);
    expect(screen.getByText("12.5")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByText("incomplete")).toBeInTheDocument();
  });

  it("renders DNP and game minutes left", () => {
    const actual = lineupActual(
      [
        slot({ dkId: "a", actual: { pts: null, state: "dnp", secsRemaining: 0 } }),
        slot({ dkId: "b", playerId: "HOU_DST", actual: { pts: 3, state: "live", secsRemaining: 90 } }),
      ],
      20,
    );
    render(<LineupCard lineup={lineup} actual={actual} />);
    expect(screen.getByText("DNP")).toBeInTheDocument();
    expect(screen.getAllByText("3.0").length).toBeGreaterThan(0);
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/game/)).toBeInTheDocument();
  });
});
