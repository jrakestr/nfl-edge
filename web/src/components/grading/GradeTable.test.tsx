import { render, screen } from "@testing-library/react";
import { GradeTable } from "@/components/grading/GradeTable";
import type { GradedGame } from "@/lib/grade-types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/grading",
  useSearchParams: () => new URLSearchParams(),
}));

function base(over: Partial<GradedGame> = {}): GradedGame {
  return {
    gameId: "2026_01_GB_MIN",
    week: 1,
    runId: "4d5d8a29",
    home: "MIN",
    away: "GB",
    gameday: "2026-09-14",
    gametime: "13:00",
    homeScore: 27,
    awayScore: 10,
    result: 17,
    scoreTotal: 37,
    meanSpread: -3,
    meanTotal: 44.5,
    homeWinProb: 0.58,
    spreadLine: -1.5,
    spreadModelProb: 0.54,
    spreadMarketProb: 0.48,
    spreadEdge: 0.06,
    spreadHasPick: true,
    spreadOutcome: 1,
    spreadClvPoints: 1.5,
    spreadVerdictCall: "pays",
    totalLine: 43.5,
    totalModelProb: 0.51,
    totalMarketProb: 0.5,
    totalEdge: 0.01,
    totalHasPick: true,
    totalOutcome: 1,
    totalClvPoints: null,
    mlModelProb: 0.58,
    mlMarketProb: 0.55,
    mlEdge: 0.03,
    mlOutcome: 1,
    homeSpreadOdds: -112,
    awaySpreadOdds: -108,
    snapshotCount: 3,
    ...over,
  };
}

describe("GradeTable", () => {
  it("2026_01_GB_MIN shows Won, not pays", () => {
    render(<GradeTable games={[base()]} />);
    expect(screen.getByText("Won")).toBeInTheDocument();
    expect(screen.queryByText("pays")).not.toBeInTheDocument();
    expect(screen.getByText(/Line moved our way/)).toBeInTheDocument();
    expect(screen.getByTitle(/3 snapshots/)).toHaveTextContent("+1.5");
    expect(screen.queryByText("0.0")).not.toBeInTheDocument();
  });

  it("no spread pick is No bet with muted verdict call", () => {
    render(
      <GradeTable
        games={[
          base({
            gameId: "2026_01_NO_BET",
            spreadHasPick: false,
            spreadOutcome: null,
            spreadEdge: -0.002,
            spreadVerdictCall: "coin flip",
            spreadClvPoints: null,
            snapshotCount: 1,
          }),
        ]}
      />,
    );
    expect(screen.getByText("No bet")).toBeInTheDocument();
    expect(screen.getByText("coin flip")).toBeInTheDocument();
    expect(screen.getByTitle(/1 snapshot/)).toBeInTheDocument();
    expect(screen.queryByText("0.0")).not.toBeInTheDocument();
  });
});
