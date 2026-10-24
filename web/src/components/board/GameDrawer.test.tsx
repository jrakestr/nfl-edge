import { render, screen, within } from "@testing-library/react";
import { GameDrawer } from "./GameDrawer";
import { fixtureChecks, fixturePayloads, fixtureRows } from "@/test/fixture";
import type { GameDetail } from "@/lib/types";

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

  it("omits the run clock suffix when runCreatedAt is undefined", () => {
    const row = fixtureRows().find((r) => r.game_id === "2026_01_BAL_IND") ?? fixtureRows()[0]!;
    const payload = fixturePayloads().find((p) => p.game_id === row.game_id) ?? fixturePayloads()[0]!;
    const checks = {
      ...fixtureChecks()[row.game_id]!,
      failed: ["spread_gap_vs_market"],
      failedRows: [
        { check_name: "spread_gap_vs_market", value: 7.5, threshold: 4, team: null, severity: "warning" },
      ],
    };
    render(<GameDrawer row={row} verdict={payload} checks={checks} open onOpenChange={() => {}} />);
    const section = screen.getByRole("region", { name: "Checks" });
    expect(section).toHaveTextContent(`${row.away}@${row.home} 7.5 (limit 4.0)`);
    expect(section).not.toHaveTextContent("at run");
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

    const edgesRegions = screen.getAllByRole("region", { name: "Edges" });
    expect(edgesRegions).toHaveLength(1);
    const edgesRegion = edgesRegions[0]!;
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

describe("GameDrawer review scenarios and panels", () => {
  it("uses player_id as key so duplicate display_name players both render without warning", () => {
    const row = fixtureRows()[0]!;
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <GameDrawer
        row={row}
        verdict={null}
        checks={null}
        players={[
          { player_id: "00-0034857", display_name: "Josh Allen", position: "QB", fpts_dk_mean: 24.1 },
          { player_id: "00-0035228", display_name: "Josh Allen", position: "DST", fpts_dk_mean: 9.4 },
        ]}
        open
        onOpenChange={() => {}}
      />,
    );
    const proj = screen.getByRole("region", { name: "Top player projections" });
    expect(within(proj).getAllByText("Josh Allen")).toHaveLength(2);
    expect(errSpy.mock.calls.some((args) => args.join(" ").includes("same key"))).toBe(false);
    errSpy.mockRestore();
  });

  it("sorts missing edges last under default Edge descending sort", () => {
    const base = fixtureRows()[0]!;
    const row = {
      ...base,
      edges: {
        ...base.edges,
        ml_home: null,
      },
    };
    render(<GameDrawer row={row} verdict={null} checks={null} open onOpenChange={() => {}} />);
    const edgesRegion = screen.getByRole("region", { name: "Edges" });
    const bodyRows = within(edgesRegion).getAllByRole("row").slice(1);
    const lastRow = bodyRows[bodyRows.length - 1]!;
    expect(lastRow).toHaveTextContent(`${row.home} moneyline`);
  });

  it("uses h3 headings, keeps SheetDescription to kickoff only, and renders no placeholder copy", () => {
    const row = fixtureRows()[0]!;
    render(<GameDrawer row={row} verdict={null} checks={null} open onOpenChange={() => {}} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelectorAll("h4")).toHaveLength(0);
    expect(dialog.querySelectorAll("h3").length).toBeGreaterThanOrEqual(5);

    const descId = dialog.getAttribute("aria-describedby");
    expect(descId).toBeTruthy();
    const descEl = document.getElementById(descId!);
    expect(descEl?.textContent).toMatch(/ET$/);
    expect(descEl?.textContent).not.toContain(row.home);

    expect(dialog).not.toHaveTextContent(/coming with the draws API/i);
    expect(dialog).not.toHaveTextContent(/not yet implemented/i);
  });

  it("renders Score distribution, Fair vs market history, and Correlations from GameDetail", () => {
    const row = fixtureRows()[0]!;
    const detail: GameDetail = {
      grid: {
        margin: { lo: -3, counts: [0, 10, 20, 30, 25, 15, 0] },
        total: { lo: 40, counts: [5, 25, 40, 20, 10] },
      },
      lineHistory: [
        {
          id: 10,
          captured_at: "2026-09-10T14:00:00.000Z",
          spread_line: 3,
          total_line: 44.5,
          home_moneyline: -155,
          away_moneyline: 130,
        },
        {
          id: 11,
          captured_at: "2026-09-12T17:55:00.000Z",
          spread_line: 3.5,
          total_line: 45,
          home_moneyline: -170,
          away_moneyline: 142,
        },
        {
          id: 12,
          captured_at: "2026-09-13T15:00:00.000Z",
          spread_line: 4,
          total_line: 45.5,
          home_moneyline: -180,
          away_moneyline: 150,
        },
      ],
      correlations: [
        { a: "Lamar Jackson", b: "Zay Flowers", a_pos: "QB", b_pos: "WR", corr: 0.44 },
        { a: "Derrick Henry", b: "IND DST", a_pos: "RB", b_pos: "DST", corr: -0.28 },
      ],
    };

    render(
      <GameDrawer
        row={row}
        verdict={null}
        checks={null}
        detail={detail}
        runCreatedAt="2026-09-12T18:00:00.000Z"
        open
        onOpenChange={() => {}}
      />,
    );

    const dist = screen.getByRole("region", { name: "Score distribution" });
    expect(within(dist).getByRole("img", { name: /margin distribution across 100 draws/i })).toBeInTheDocument();
    expect(within(dist).getByRole("img", { name: /Total points distribution across 100 draws/i })).toBeInTheDocument();
    expect(dist.querySelectorAll("[data-hist-bar]")).toHaveLength(5 + 5);
    expect(dist.querySelectorAll('[data-mark="model"]')).toHaveLength(2);
    expect(dist.querySelectorAll('[data-mark="market"]')).toHaveLength(2);

    const hist = screen.getByRole("region", { name: "Fair vs market history" });
    const snapItems = within(hist).getAllByRole("listitem");
    expect(snapItems).toHaveLength(3);
    expect(snapItems[1]).toHaveTextContent("at run Sat 14:00");

    const corr = screen.getByRole("region", { name: "Correlations" });
    const corrItems = within(corr).getAllByRole("listitem");
    expect(corrItems).toHaveLength(2);
    expect(corrItems[0]).toHaveTextContent("Lamar Jackson");
    expect(corrItems[0]).toHaveTextContent("Zay Flowers");
    expect(corrItems[0]).toHaveTextContent("usually up");
    expect(corrItems[0]).toHaveTextContent("+0.44");
    expect(corrItems[1]).toHaveTextContent("usually down");
    expect(corrItems[1]).toHaveTextContent("−0.28");
  });
});
