import { fireEvent, render, screen, within } from "@testing-library/react";
import { SlateReview } from "@/components/dfs/SlateReview";
import type { ReviewData, ReviewFact, ReviewLineup } from "@/lib/review";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  usePathname: () => "/week/6/dfs/dk/main/review",
  useSearchParams: () => new URLSearchParams(),
}));

const NAMES = ["QB One", "RB One", "RB Two", "WR One", "WR Two", "WR Three", "TE One", "Flex One", "Chiefs"];

const facts: ReviewFact[] = NAMES.map((name, i) => ({
  playerId: `id${i}`,
  name,
  team: "KC",
  position: name === "Chiefs" ? "DST" : name.startsWith("QB") ? "QB" : "WR",
  salary: 5000,
  proj: 10 + i,
  sd: 4,
  p10: 2,
  p90: 25,
  boom: 0.2,
  bust: 0.3,
  top1Pct: 0.04,
  ownOurs: 0.3,
  ownFieldSim: 0.1,
  actual: 10 + i,
}));
facts.push({ ...facts[0]!, playerId: "x", name: "Missed Guy", position: "RB", actual: 45, ownOurs: null });

const lineup: ReviewLineup = {
  id: "7",
  stack: "KC 3",
  salary: 49800,
  proj: 120,
  actual: 99,
  winPct: 0.02,
  slots: NAMES.map((name, i) => ({ slot: `S${i}`, name, dkId: String(i), playerId: `id${i}` })),
  entries: [{ contestKey: 1, rank: 12, points: 99, cashed: true, winnings: 5 }],
};

const CONTEST = { key: 1, name: "NFL $6K Huddle", entries: 1426, placesPaid: 300, top1Score: 90, cashScore: 80 };

function data(over: Partial<ReviewData> = {}): ReviewData {
  return {
    week: 6,
    site: "dk",
    slate: "main",
    runId: "r",
    totalLineups: 2,
    lineups: [lineup, { ...lineup, id: "8", actual: null, entries: [] }],
    facts,
    contests: [CONTEST],
    contest: CONTEST,
    contestPlayers: [
      ...NAMES.map((name, i) => ({ name, position: null, own: i === 0 ? 0.4 : 0.05, top1Rate: 0.1, fpts: 11 })),
      { name: "Missed Guy", position: "RB", own: 0.03, top1Rate: 0.3, fpts: 45 },
    ],
    ...over,
  };
}

describe("SlateReview", () => {
  it("shows only the empty state when scores are unpublished", () => {
    render(<SlateReview data={null} week={6} site="dk" slate="main" />);
    expect(screen.getByText("Scores unpublished")).toBeInTheDocument();
    expect(screen.queryByLabelText("Portfolio")).toBeNull();
    expect(screen.queryByLabelText("Chalk")).toBeNull();
    expect(screen.queryByLabelText("Lineups")).toBeNull();
  });

  it("renders portfolio, panels, and the lineup drawer for a populated slate", () => {
    render(<SlateReview data={data()} week={6} site="dk" slate="main" />);
    const portfolio = screen.getByLabelText("Portfolio");
    expect(within(portfolio).getByText("1 of 2 mass lineups graded, 1 incomplete (a slot has no actual)", { exact: false })).toBeInTheDocument();
    expect(within(portfolio).getAllByText("99.00").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Chalk")).toBeInTheDocument();
    expect(screen.getByLabelText("Low-owned hits")).toBeInTheDocument();
    const scorers = screen.getByLabelText("Top scorers");
    const missed = within(scorers).getByText("Missed Guy").closest("tr")!;
    expect(within(missed).getByText("Missed")).toBeInTheDocument();

    fireEvent.click(within(screen.getByLabelText("Lineups")).getByText("#7"));
    const slots = screen.getByLabelText("Lineup slots");
    expect(within(slots).getAllByRole("row")).toHaveLength(1 + 9 + 1);
    expect(within(slots).getByText("99.00")).toBeInTheDocument();
  });

  it("keeps contest panels empty without a standings file", () => {
    render(
      <SlateReview
        data={data({ contests: [], contest: null, contestPlayers: [] })}
        week={6}
        site="dk"
        slate="main"
      />,
    );
    expect(screen.getByText("No contest file for this slate")).toBeInTheDocument();
    expect(screen.queryByLabelText("Chalk")).toBeNull();
    expect(screen.queryByLabelText("Low-owned hits")).toBeNull();
    expect(screen.getByLabelText("Top scorers")).toBeInTheDocument();
  });
});
