import { render, screen, within } from "@testing-library/react";
import { NgsCompare } from "@/components/grading/NgsCompare";
import type { GameCompare, SiteCompare } from "@/lib/ngs-compare";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/grading",
  useSearchParams: () => new URLSearchParams(),
}));

const flags = { pick: "right", within7: true, ats: "hit" } as const;

function game(over: Partial<GameCompare>): GameCompare {
  return {
    gameId: "g1",
    week: 3,
    home: "GB",
    away: "ATL",
    gameday: "2026-09-24",
    gametime: "20:15",
    actualMarginHome: -21,
    siteMargin: 3.4,
    ourMargin: 2,
    site: { pick: "wrong", within7: false, ats: "hit" },
    ours: flags,
    ...over,
  };
}

const m = (right: number, n: number) => ({ right, n });
const t = (p: [number, number], w: [number, number], a: [number, number]) => ({
  pick: m(...p),
  within7: m(...w),
  ats: { ...m(...a), pushes: 0 },
});

const COMPARE: SiteCompare = {
  site: t([9, 16], [10, 16], [9, 16]),
  ours: t([8, 15], [6, 15], [10, 15]),
  siteSame: t([8, 15], [9, 15], [9, 15]),
  ungraded: 1,
  games: [game({}), game({ gameId: "g2", home: "DET", away: "NYJ", ours: null })],
};

describe("NgsCompare", () => {
  it("shows ours, site, the like-for-like site column, and a colored gap", () => {
    render(<NgsCompare compare={COMPARE} week={3} />);
    const summary = screen.getByRole("table", { name: "Ours against the site" });
    expect(within(summary).getByText("Site, same games")).toBeInTheDocument();
    expect(summary).toHaveTextContent("Pick accuracy");
    expect(summary).toHaveTextContent("56.3%");
    expect(summary).toHaveTextContent("9 of 16 games");
    expect(summary).toHaveTextContent("53.3%");
    // pick: 8/15 vs 8/15 same games is even; margin within 7: 40.0% vs 60.0% is behind; ats ahead
    expect(within(summary).getByText("0.0 pts")).toBeInTheDocument();
    expect(within(summary).getByText("−20.0 pts")).toHaveClass("text-edge-neg");
    expect(within(summary).getByText("+6.7 pts")).toHaveClass("text-edge-pos");
    expect(screen.getByText(/1 finished game is not graded on our side \(no run before kickoff/)).toBeInTheDocument();
  });

  it("marks a game with no graded run instead of hiding it", () => {
    render(<NgsCompare compare={COMPARE} week={3} />);
    expect(screen.getByText("Not graded on our side")).toBeInTheDocument();
    expect(screen.getAllByText("Week 3")).toHaveLength(2);
  });

  it("names the command when there is nothing to compare", () => {
    render(
      <NgsCompare
        compare={{ ...COMPARE, games: [], ungraded: 0 }}
        week={4}
      />,
    );
    expect(screen.getByText(/No finished NFLGameSim games for week 4/)).toBeInTheDocument();
    expect(screen.getByText(/benchmark nflgamesim/)).toBeInTheDocument();
  });
});
