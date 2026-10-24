import { render, screen, within } from "@testing-library/react";
import { GameDrawer } from "./GameDrawer";
import { fixtureChecks, fixturePayloads, fixtureRows } from "@/test/fixture";

vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ sentences: [], payload: null }), { status: 200 })));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/week/1",
  useSearchParams: () => new URLSearchParams(),
}));

describe("GameDrawer schedule-only", () => {
  it("opens with matchup and market lines and no verdicts or edges", () => {
    const row = {
      ...fixtureRows()[0]!,
      fair_spread: null,
      fair_total: null,
      mean_spread: null,
      mean_total: null,
      home_win_prob: null,
      p_home_cover_market: null,
      edges: {
        spread_home: null,
        spread_away: null,
        total_over: null,
        total_under: null,
        ml_home: null,
        ml_away: null,
      },
    };
    render(
      <GameDrawer
        row={row}
        verdict={null}
        checks={null}
        scheduleOnly
        open
        onOpenChange={() => {}}
      />,
    );
    expect(screen.getByText(row.away)).toBeInTheDocument();
    expect(screen.getByText(row.home)).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Verdict" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Edges" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Why" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Checks" })).not.toBeInTheDocument();
  });
});

describe("GameDrawer checks", () => {
  it("lists each failed row with value, threshold, and the run clock", () => {
    const row = fixtureRows().find((r) => r.game_id === "2026_01_BAL_IND") ?? fixtureRows()[0]!;
    const payload = fixturePayloads().find((p) => p.game_id === row.game_id) ?? fixturePayloads()[0]!;
    const checks = {
      ...fixtureChecks()[row.game_id]!,
      failed: ["spread_gap_vs_market"],
      failedRows: [
        { check_name: "spread_gap_vs_market", value: 7.5, threshold: 4, team: null, severity: "warning" },
      ],
    };
    render(
      <GameDrawer
        row={row}
        verdict={payload}
        checks={checks}
        runCreatedAt="2026-09-12T18:00:00.000Z"
        open
        onOpenChange={() => {}}
      />,
    );
    const section = screen.getByRole("region", { name: "Checks" });
    expect(section).not.toHaveTextContent("failed: spread_gap_vs_market");
    expect(within(section).getByText(/spread_gap_vs_market/)).toBeInTheDocument();
    expect(section).toHaveTextContent(`${row.away}@${row.home} 7.5 (limit 4.0) · at run Sat 14:00`);
  });

  it("renders in a centered wide modal (max-w-5xl) with all six Edges columns in a fixed table and closes on Escape", () => {
    const row = fixtureRows()[0]!;
    const payload = fixturePayloads().find((p) => p.game_id === row.game_id) ?? fixturePayloads()[0]!;
    const onOpenChange = vi.fn();
    render(
      <GameDrawer
        row={row}
        verdict={payload}
        checks={fixtureChecks()[row.game_id] ?? null}
        open
        onOpenChange={onOpenChange}
      />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("data-side", "center");
    expect(dialog.className).toContain("data-[side=center]:max-w-5xl");
    expect(dialog.className).toContain("data-[side=center]:w-[min(94vw,64rem)]");

    const edgesRegion = screen.getAllByRole("region", { name: "Edges" })[0]!;
    const table = within(edgesRegion).getByRole("table");
    expect(table).toHaveClass("w-full", "table-fixed");
    for (const col of ["Side", "Model", "Market", "Edge", "Price", "¼ Kelly"]) {
      expect(within(edgesRegion).getByRole("columnheader", { name: new RegExp(col) })).toBeInTheDocument();
    }

    const closeBtn = within(dialog).getByRole("button", { name: "Close" });
    closeBtn.click();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
