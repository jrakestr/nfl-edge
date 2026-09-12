import { fireEvent, render, screen } from "@testing-library/react";
import { ChecksPanel } from "./ChecksPanel";
import type { FailedCheckGroup } from "@/lib/check-display";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/week/1",
  useSearchParams: () => new URLSearchParams("view=plain"),
}));

const groups: FailedCheckGroup[] = [
  {
    check_name: "spread_gap_vs_market",
    severity: "warning",
    items: [
      {
        game_id: "2026_01_MIA_LV",
        away: "MIA",
        home: "LV",
        row: { check_name: "spread_gap_vs_market", value: 9.5, threshold: 4, team: null, severity: "warning" },
      },
      {
        game_id: "2026_01_BAL_IND",
        away: "BAL",
        home: "IND",
        row: { check_name: "spread_gap_vs_market", value: 7.5, threshold: 4, team: null, severity: "warning" },
      },
    ],
  },
];

describe("ChecksPanel", () => {
  it("lists each failing game with the run-stored gap and opens it", () => {
    render(<ChecksPanel groups={groups} runCreatedAt="2026-09-12T18:00:00.000Z" />);
    const panel = screen.getByRole("region", { name: "Checks" });
    expect(panel).toHaveTextContent("Warnings");
    expect(panel).toHaveTextContent("spread_gap_vs_market");
    expect(screen.getByRole("button", { name: "MIA@LV 9.5 (limit 4.0) · at run Sat 14:00" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "BAL@IND 7.5 (limit 4.0) · at run Sat 14:00" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /BAL@IND/ }));
    expect(replace).toHaveBeenCalledWith("/week/1?view=plain&game=2026_01_BAL_IND", { scroll: false });
  });

  it("renders nothing when every check passed", () => {
    const { container } = render(<ChecksPanel groups={[]} runCreatedAt="2026-09-12T18:00:00.000Z" />);
    expect(container).toBeEmptyDOMElement();
  });
});
