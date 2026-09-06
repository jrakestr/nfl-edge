import { render, screen, within } from "@testing-library/react";
import { WeekBoard, type WeekBoardProps } from "./WeekBoard";
import { DEFAULT_FILTERS } from "./filters";
import { NO_TRACK, asFailed, fixture, fixtureChecks, fixtureRows, fixtureSummary, fixtureVerdicts } from "@/test/fixture";
import { sortVerdicts } from "@/lib/queries/verdicts";
import { maxEdge } from "@/lib/edge";

// The board's client children (WeekHeader, RunBadge) read the router; the route test stubs it.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/week/1",
  useSearchParams: () => new URLSearchParams(),
}));

function props(over: Partial<WeekBoardProps> = {}): WeekBoardProps {
  const run = {
    run_id: fixture.run.run_id,
    created_at: "2026-09-06T19:20:00.000Z",
    draws_per_game: fixture.run.draws,
    git_sha: null,
  };
  return {
    season: 2026,
    week: 1,
    weeks: [1],
    view: "plain",
    filters: DEFAULT_FILTERS,
    run,
    runs: [run],
    stale: false,
    verdicts: sortVerdicts(fixtureVerdicts()),
    rows: fixtureRows().sort((a, b) => maxEdge(b) - maxEdge(a)),
    checks: fixtureChecks(),
    track: NO_TRACK,
    ...over,
  };
}

describe("/week/[n] against the Week 1 fixture", () => {
  it("plain english: the week summary and one card per game, biggest edge first", () => {
    render(<WeekBoard {...props()} />);
    expect(screen.getByRole("region", { name: "Week summary" })).toHaveTextContent(fixtureSummary.replace(/\s+/g, " "));
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(16);
    const edges = cards.map((c) => c.getAttribute("data-game")!).map((g) => fixture.games.find((x) => (x as { game_id: string }).game_id === g) as { max_edge: number });
    for (let i = 1; i < edges.length; i++) expect(edges[i - 1].max_edge).toBeGreaterThanOrEqual(edges[i].max_edge);
  });

  it("table: four tiles then a row per game; track record reads 'No graded weeks yet'", () => {
    render(<WeekBoard {...props({ view: "table" })} />);
    const tiles = within(screen.getByRole("list", { name: "Week summary tiles" })).getAllByRole("listitem");
    expect(tiles).toHaveLength(4);
    expect(tiles[0]).toHaveTextContent("16");
    expect(tiles[3]).toHaveTextContent("No graded weeks yet");
    const table = screen.getByRole("region", { name: "Edge table" });
    expect(table.querySelectorAll("tbody tr[data-game]")).toHaveLength(16);
    // EdgeCells carry the intensity ramp from model.edges
    expect(table.querySelectorAll('[data-intensity="strong"]').length).toBeGreaterThan(0);
  });

  it("a failed invariant withholds the chips for that game only", () => {
    const verdicts = fixtureVerdicts();
    verdicts[0] = { ...verdicts[0], payload: asFailed(verdicts[0].payload) };
    render(<WeekBoard {...props({ verdicts: sortVerdicts(verdicts) })} />);
    const cards = screen.getAllByRole("article");
    const failed = cards.filter((c) => c.dataset.status === "fail");
    expect(failed).toHaveLength(1);
    expect(within(failed[0]).queryByRole("complementary", { name: "Chips" })).toBeNull();
    expect(cards.at(-1)).toBe(failed[0]); // fail rows sort last
    expect(cards.filter((c) => within(c).queryByRole("complementary", { name: "Chips" }))).toHaveLength(15);
  });

  it("no run for the week: empty state with the commands to run", () => {
    render(<WeekBoard {...props({ run: null, runs: [], verdicts: [], rows: [], checks: {} })} />);
    expect(screen.getByText(/No simulation for this week yet/)).toBeInTheDocument();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });

  it("flags games whose newest line is newer than their verdict", () => {
    render(<WeekBoard {...props({ verdicts: sortVerdicts(fixtureVerdicts()).slice(0, 14) })} />);
    expect(screen.getByRole("note")).toHaveTextContent("2 of 16 games have a newer line");
  });
});
