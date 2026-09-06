import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import week1 from "@/test/fixtures/week1.json";
import { pivotEdges } from "@/lib/edge";
import { VerdictPayloadSchema, type BoardRow, type GameChecks, type VerdictPayload, type VerdictRow } from "@/lib/types";
import { PageActionsProvider } from "@/components/shell/PageActions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/week/1",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: vi.fn(),
}));

const games = (week1.games as unknown[]).map((g) => VerdictPayloadSchema.parse(g));
const runId = week1.run.run_id as string;

const verdicts: VerdictRow[] = games.map((payload, i) => ({
  game_id: payload.game_id,
  market_line_id: payload.market?.snapshot_id ?? i + 1,
  payload,
}));

function rowFrom(g: VerdictPayload, i: number): BoardRow {
  const kick = g.kickoff ?? "";
  return {
    game_id: g.game_id,
    home: g.home,
    away: g.away,
    gameday: kick.slice(0, 10),
    gametime: kick.length >= 16 ? kick.slice(11, 16) : null,
    fair_spread: g.fair.spread,
    fair_total: g.fair.total,
    mean_spread: g.fair.spread_mean ?? null,
    mean_total: g.fair.total_mean ?? null,
    home_win_prob: g.fair.home_win_prob,
    p_home_cover_market: g.chips?.side?.prob ?? null,
    p_over_market: g.chips?.total?.prob ?? null,
    market_line_id: g.market?.snapshot_id ?? i + 1,
    captured_at: g.market?.captured_at ?? null,
    spread_line: g.market?.spread ?? null,
    total_line: g.market?.total ?? null,
    home_spread_odds: g.market?.home_spread_odds ?? null,
    away_spread_odds: g.market?.away_spread_odds ?? null,
    over_odds: g.market?.over_odds ?? null,
    under_odds: g.market?.under_odds ?? null,
    home_moneyline: g.market?.home_moneyline ?? null,
    away_moneyline: g.market?.away_moneyline ?? null,
    edges: pivotEdges(g.edges),
  };
}

const rows = games.map(rowFrom);
const checks = new Map<string, GameChecks>(
  games.map((g) => [
    g.game_id,
    {
      game_id: g.game_id,
      status: g.status,
      failed: g.status === "ok" ? [] : ["spread_gap_vs_market"],
      invariants: 7,
      warnings: g.status === "warn" ? 1 : 0,
    },
  ]),
);

const run = {
  run_id: runId,
  season: 2026,
  week: 1,
  created_at: new Date("2026-09-04T16:00:00Z"),
  draws_per_game: 20000,
  git_sha: "5823f735",
};

vi.mock("@/lib/queries/runs", () => ({
  weeksWithRuns: async () => [{ week: 1, newest_run_id: runId, created_at: run.created_at, runs: 1 }],
  runsForWeek: async () => [run],
  newerRunExists: () => false,
}));
vi.mock("@/lib/queries/verdicts", () => ({
  verdictsForRun: async () => verdicts,
}));
vi.mock("@/lib/queries/board", () => ({
  boardRows: async () => rows,
}));
vi.mock("@/lib/queries/checks", () => ({
  checksForRun: async () => checks,
}));
vi.mock("@/lib/queries/results", () => ({
  trackRecord: async () => ({ gradedWeeks: 0, wins: 0, losses: 0, pushes: 0, roi: null }),
}));

import WeekPage from "@/app/week/[n]/page";

describe("WeekPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 16 VerdictCards sorted by max_edge with the week summary", async () => {
    render(
      <PageActionsProvider>
        {await WeekPage({ params: Promise.resolve({ n: "1" }), searchParams: Promise.resolve({}) })}
      </PageActionsProvider>,
    );
    const cards = document.querySelectorAll("[data-game]");
    expect(cards).toHaveLength(16);
    const ids = [...cards].map((el) => el.getAttribute("data-game"));
    const expected = [...games].sort((a, b) => {
      const fa = a.status === "fail" ? 1 : 0;
      const fb = b.status === "fail" ? 1 : 0;
      if (fa !== fb) return fa - fb;
      return b.max_edge - a.max_edge;
    });
    expect(ids).toEqual(expected.map((g) => g.game_id));
    expect(screen.getByText(/11 sides and 13 totals/i)).toBeInTheDocument();
    expect(document.querySelectorAll("[data-status=warn]").length).toBeGreaterThanOrEqual(5);
  });

  it("table view has 16 rows and the ungraded track-record tile", async () => {
    render(
      <PageActionsProvider>
        {await WeekPage({
          params: Promise.resolve({ n: "1" }),
          searchParams: Promise.resolve({ view: "table" }),
        })}
      </PageActionsProvider>,
    );
    expect(document.querySelector("[data-view=table]")).toBeTruthy();
    expect(screen.getByText("No graded weeks yet")).toBeInTheDocument();
    expect(screen.getByLabelText("Edge table").querySelectorAll("tbody tr").length).toBe(16);
  });
});
