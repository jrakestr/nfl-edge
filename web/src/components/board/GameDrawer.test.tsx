import { render, screen, within } from "@testing-library/react";
import { GameDrawer } from "./GameDrawer";
import { fixtureChecks, fixturePayloads, fixtureRows } from "@/test/fixture";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/week/1",
  useSearchParams: () => new URLSearchParams(),
}));

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
});
