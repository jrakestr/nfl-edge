import { render, screen, within } from "@testing-library/react";
import { StandingsTable } from "./StandingsTable";
import { VIEWER_ESPN_TEAM_ID, type StandingRow } from "@/lib/league";

vi.mock("next/navigation", () => ({
  usePathname: () => "/league",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const row = (over: Partial<StandingRow>): StandingRow => ({
  espn_team_id: 1,
  team: "Alpha",
  owner: "A Owner",
  wins: 3,
  losses: 1,
  ties: 0,
  pf: 600,
  pa: 500,
  proj_pf: 560,
  plus_minus: 40,
  allplay_wins: 30,
  allplay_losses: 14,
  pts_back_of_pf_leader: 0,
  all_final: true,
  ...over,
});

describe("StandingsTable", () => {
  it("lists teams in the order given, with record and link to the team page", () => {
    render(
      <StandingsTable
        season={2026}
        rows={[row({ team: "Alpha" }), row({ espn_team_id: 2, team: "Bravo", wins: 1, losses: 3, plus_minus: -12 })]}
      />,
    );
    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]!).getByRole("link", { name: "Alpha" })).toHaveAttribute("href", "/league/team/1");
    expect(within(rows[1]!).getByText("1–3")).toBeInTheDocument();
  });

  it("colors only the plus/minus column", () => {
    const { container } = render(<StandingsTable season={2026} rows={[row({ plus_minus: 40 })]} />);
    const colored = container.querySelectorAll("[data-edge]");
    expect(colored).toHaveLength(1);
    expect(colored[0]).toHaveAttribute("data-edge", "pos");
    expect(colored[0]).toHaveTextContent("+40.0");
  });

  it("names the empty state and the fix", () => {
    render(<StandingsTable season={2026} rows={[]} />);
    expect(screen.getByText(/nfl-edge ingest espn-league/i)).toBeInTheDocument();
  });

  it("washes your row and paints the name in the line color", () => {
    render(
      <StandingsTable
        season={2026}
        rows={[row({ espn_team_id: VIEWER_ESPN_TEAM_ID, team: "int3rc3pt" }), row({})]}
      />,
    );
    const yours = screen.getByRole("link", { name: "int3rc3pt" });
    expect(yours).toHaveClass("text-line");
    expect(yours.closest("tr")).toHaveAttribute("data-yours", "true");
    expect(screen.getByRole("link", { name: "Alpha" }).closest("tr")).not.toHaveAttribute("data-yours");
  });

  it("carries the season in team links off the default", () => {
    render(<StandingsTable season={2025} rows={[row({})]} />);
    expect(screen.getByRole("link", { name: "Alpha" })).toHaveAttribute("href", "/league/team/1?season=2025");
  });
});
