import { render, screen, within } from "@testing-library/react";
import { PageActionsProvider } from "@/components/shell/PageActions";
import { fixture, fixtureChecks, fixtureRows, fixtureSummary, fixtureVerdicts, NO_TRACK } from "@/test/fixture";
import { sortVerdicts } from "@/lib/queries/verdicts";
import { maxEdge } from "@/lib/edge";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/week/1",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("notFound");
  },
}));

const runId = fixture.run.run_id;
const run = {
  run_id: runId,
  season: 2026,
  week: 1,
  created_at: new Date("2026-09-04T16:00:00Z"),
  draws_per_game: fixture.run.draws,
  git_sha: "5823f735",
};

vi.mock("@/lib/queries/runs", () => ({
  weeksWithRuns: async () => [{ week: 1, newest_run_id: runId, created_at: run.created_at, runs: 1 }],
  runsForWeek: async () => [run],
  newerRunExists: () => false,
}));
vi.mock("@/lib/queries/verdicts", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/queries/verdicts")>();
  const { fixtureVerdicts: v } = await import("@/test/fixture");
  return {
    ...orig,
    verdictsForRun: async () => orig.sortVerdicts(v()),
  };
});
vi.mock("@/lib/queries/board", () => ({
  boardRows: async () => fixtureRows().sort((a, b) => maxEdge(b) - maxEdge(a)),
}));
vi.mock("@/lib/queries/checks", () => ({
  checksForRun: async () => new Map(Object.entries(fixtureChecks())),
}));
vi.mock("@/lib/queries/results", () => ({
  trackRecord: async () => NO_TRACK,
}));
vi.mock("@/lib/queries/players", () => ({
  topPlayersByGame: async () => ({}),
}));

import WeekPage from "@/app/week/[n]/page";

const WARN = [
  "2026_01_ARI_LAC",
  "2026_01_BAL_IND",
  "2026_01_DAL_NYG",
  "2026_01_MIA_LV",
  "2026_01_NYJ_TEN",
];

async function renderWeek(view?: string) {
  return render(
    <PageActionsProvider>
      {await WeekPage({
        params: Promise.resolve({ n: "1" }),
        searchParams: Promise.resolve(view ? { view } : {}),
      })}
    </PageActionsProvider>,
  );
}

describe("WeekPage", () => {
  it("renders 16 VerdictCards sorted by max_edge with the week summary and five warn games", async () => {
    await renderWeek();
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(16);
    const expected = sortVerdicts(fixtureVerdicts()).map((v) => v.game_id);
    expect(cards.map((c) => c.getAttribute("data-game"))).toEqual(expected);
    expect(screen.getByRole("region", { name: "Week summary" })).toHaveTextContent(
      fixtureSummary.replace(/\s+/g, " "),
    );
    for (const id of WARN) {
      expect(document.querySelector(`[data-game="${id}"]`)).toHaveAttribute("data-status", "warn");
    }
    expect(document.querySelectorAll("article[data-status=warn]")).toHaveLength(5);
  });

  it("table view has 16 rows and tiles 16 / 11 / 13 / No graded weeks yet", async () => {
    await renderWeek("table");
    expect(document.querySelector("[data-view=table]")).toBeTruthy();
    const tiles = within(screen.getByRole("list", { name: "Week summary tiles" })).getAllByRole("listitem");
    expect(tiles).toHaveLength(4);
    expect(tiles[0]).toHaveTextContent("16");
    expect(tiles[1]).toHaveTextContent("11");
    expect(tiles[2]).toHaveTextContent("13");
    expect(tiles[3]).toHaveTextContent("No graded weeks yet");
    expect(screen.getByRole("region", { name: "Edge table" }).querySelectorAll("tbody tr[data-game]")).toHaveLength(16);
  });
});
