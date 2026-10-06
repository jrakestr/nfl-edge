import { render, screen } from "@testing-library/react";
import { GradingPage, pickAccuracy } from "@/components/grading/GradingPage";
import type { GradedGame } from "@/lib/grade-types";
import type { TrackRecord } from "@/lib/queries/results";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/grading",
  useSearchParams: () => new URLSearchParams(),
}));

function game(i: number): GradedGame {
  const n = String(i + 1).padStart(2, "0");
  return {
    gameId: `2026_01_TM${n}_XX`,
    week: 1,
    runId: "4d5d8a29",
    home: "XX",
    away: `T${n}`,
    gameday: "2026-09-13",
    gametime: "13:00",
    homeScore: 20 + i,
    awayScore: 17,
    result: 3 + i,
    scoreTotal: 37 + i,
    meanSpread: 3,
    meanTotal: 44.5,
    homeWinProb: 0.55,
    spreadLine: 3.5,
    spreadModelProb: 0.52,
    spreadMarketProb: 0.48,
    spreadEdge: 0.04,
    spreadHasPick: true,
    spreadOutcome: i % 2,
    spreadClvPoints: 0.5,
    spreadVerdictCall: i % 2 ? "pays" : "does not pay",
    totalLine: 45.5,
    totalModelProb: 0.51,
    totalMarketProb: 0.5,
    totalEdge: 0.01,
    totalHasPick: true,
    totalOutcome: 1,
    totalClvPoints: -0.5,
    mlModelProb: 0.55,
    mlMarketProb: 0.52,
    mlEdge: 0.03,
    mlOutcome: 1,
    homeSpreadOdds: -110,
    awaySpreadOdds: -110,
    snapshotCount: 3,
  };
}

const TRACK: TrackRecord = {
  gradedWeeks: 1,
  wins: 19,
  losses: 28,
  pushes: 1,
  roi: -0.177,
  kellyRoi: -0.35,
  sides: { wins: 6, losses: 9, pushes: 1 },
  totals: { wins: 8, losses: 8, pushes: 0 },
  moneyline: { wins: 5, losses: 11, pushes: 0 },
};

describe("GradingPage populated", () => {
  it("shows week 1 record, 16 games, Actual scores, calibration n, no grade-web", () => {
    const games = Array.from({ length: 16 }, (_, i) => game(i));
    render(
      <GradingPage
        track={TRACK}
        games={games}
        buckets={[
          { lo: 0.5, hi: 0.6, n: 32, hitRate: 0.5 },
          { lo: 0.6, hi: 0.7, n: 16, hitRate: 0.44 },
        ]}
        weeks={[1]}
      />,
    );
    expect(screen.getByText("19–28–1")).toBeInTheDocument();
    expect(screen.getByText("1 graded week")).toBeInTheDocument();
    expect(screen.getByText(/Headline until ten weeks/)).toBeInTheDocument();
    expect(screen.getByText(/Kelly/)).toBeInTheDocument();
    expect(screen.getByText("6–9–1")).toBeInTheDocument();
    expect(screen.getByText("8–8–0")).toBeInTheDocument();
    const tiles = screen.getByRole("list", { name: "Track record" });
    expect(tiles).toHaveTextContent("5–11–0");
    expect(tiles).toHaveTextContent("Moneyline");
    expect(screen.getAllByText("Line moved our way").length).toBeGreaterThan(0);
    expect(screen.getByText(/T01 17 – XX 20/)).toBeInTheDocument();
    expect(screen.getAllByRole("row").length).toBeGreaterThan(16);
    expect(screen.getByText("32")).toBeInTheDocument();
    expect(screen.getByText(/every graded line/i)).toBeInTheDocument();
    expect(screen.queryByText(/grade-web/i)).not.toBeInTheDocument();
    expect(screen.queryByText("No graded weeks yet")).not.toBeInTheDocument();
  });

  it("shows accuracy per week and labels the cards for the selected week", () => {
    const games = Array.from({ length: 4 }, (_, i) => game(i));
    const week3: TrackRecord = {
      ...TRACK,
      gradedWeeks: 1,
      wins: 21,
      losses: 23,
      pushes: 1,
      sides: { wins: 6, losses: 8, pushes: 0 },
    };
    render(
      <GradingPage
        track={week3}
        games={games}
        weeks={[1, 2, 3]}
        weekly={[
          { week: 1, wins: 19, losses: 28, pushes: 1 },
          { week: 2, wins: 23, losses: 22, pushes: 0 },
          { week: 3, wins: 21, losses: 23, pushes: 1 },
        ]}
        weekFilter={3}
      />,
    );
    const tiles = screen.getByRole("list", { name: "Track record" });
    expect(tiles).toHaveTextContent("Week 3 record");
    expect(tiles).toHaveTextContent("21–23–1");
    expect(tiles).toHaveTextContent("All bet types, this week only");
    expect(tiles).toHaveTextContent("48%");
    expect(tiles).toHaveTextContent("21 of 44 bets won");
    expect(tiles).toHaveTextContent("Bet win rate");
    expect(tiles).toHaveTextContent("Spread bets");
    expect(tiles).toHaveTextContent("6–8–0");
    expect(tiles).toHaveTextContent("43% won");
    expect(tiles).not.toHaveTextContent("Sides");
    const nav = screen.getByRole("navigation", { name: "Week" });
    expect(nav).toHaveTextContent("Week 1 40%");
    expect(nav).toHaveTextContent("Week 2 51%");
    expect(nav).toHaveTextContent("Week 3 48%");
  });

  it("lines up with the NFLGameSim page and shows misses against the book", () => {
    const games = Array.from({ length: 16 }, (_, i) => game(i));
    render(<GradingPage track={TRACK} games={games} weeks={[1]} finalByWeek={{ 1: 16 }} />);
    const tiles = screen.getByRole("list", { name: "Margin accuracy" });
    expect(tiles).toHaveTextContent("Pick accuracy");
    expect(tiles).toHaveTextContent("100.0%");
    expect(tiles).toHaveTextContent("16 of 16 games");
    expect(tiles).toHaveTextContent("Margin within 7 pts");
    expect(tiles).toHaveTextContent("50.0%");
    expect(tiles).toHaveTextContent("8 of 16 games");
    expect(tiles).toHaveTextContent("Beat the spread");
    expect(tiles).toHaveTextContent("1 of 16 games");
    expect(tiles).toHaveTextContent("Margin miss, points");
    expect(tiles).toHaveTextContent("Book 7.1");
    expect(tiles).toHaveTextContent("0.4 farther");
    expect(tiles).toHaveTextContent("Total miss, points");
    expect(tiles).toHaveTextContent("0.1 closer");
    expect(tiles).toHaveTextContent("Too high on the away team");
    expect(screen.getByText("7.1")).toHaveClass("text-line");
    expect(screen.getByLabelText("Games counted")).toHaveTextContent("All 16 finished games counted");
  });

  it("says how many finished games were not graded", () => {
    const games = Array.from({ length: 15 }, (_, i) => game(i));
    render(<GradingPage track={TRACK} games={games} weeks={[1]} finalByWeek={{ 1: 16 }} />);
    expect(screen.getByLabelText("Games counted")).toHaveTextContent(
      "15 of 16 finished games counted. A game with no run before kickoff is not graded.",
    );
  });

  it("pickAccuracy leaves pushes out and is a dash with no decided picks", () => {
    expect(pickAccuracy({ wins: 1, losses: 3 })).toBe("25%");
    expect(pickAccuracy({ wins: 0, losses: 0 })).toBe("—");
  });
});
