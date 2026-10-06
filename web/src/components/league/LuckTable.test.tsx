import { render, screen } from "@testing-library/react";
import { LuckTable } from "./LuckTable";
import type { LuckFit, LuckRow } from "@/lib/league";

vi.mock("next/navigation", () => ({
  usePathname: () => "/league/luck",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

const row = (over: Partial<LuckRow>): LuckRow => ({
  espn_team_id: 1,
  team: "Alpha",
  proj_wins: 2.0,
  earned_wins: 2.5,
  actual_wins: 3,
  luck: 0.5,
  luck_allplay: -0.4,
  ...over,
});
const fit: LuckFit = { bias: 5.33, sd: 28.73, n_team_weeks: 48, weeks: 4, computed_at: "2026-10-06T04:10:28Z" };

describe("LuckTable", () => {
  it("colors luck and all-play luck, and nothing else", () => {
    const { container } = render(<LuckTable season={2026} rows={[row({})]} fit={fit} finalWeeks={4} />);
    const colored = [...container.querySelectorAll("[data-edge]")];
    expect(colored.map((e) => e.textContent)).toEqual(["+0.50", "−0.40"]);
    expect(colored.map((e) => e.getAttribute("data-edge"))).toEqual(["pos", "neg"]);
  });

  it("discloses the fitted bias, spread, and sample", () => {
    render(<LuckTable season={2026} rows={[row({})]} fit={fit} finalWeeks={4} />);
    expect(screen.getByText(/5\.3 points/)).toBeInTheDocument();
    expect(screen.getByText(/28\.7/)).toBeInTheDocument();
    expect(screen.getByText(/48 team-weeks/)).toBeInTheDocument();
  });

  it("fails closed under two final weeks and says how many exist", () => {
    render(<LuckTable season={2026} rows={[]} fit={null} finalWeeks={1} />);
    expect(screen.getByText(/at least 2 final weeks/i)).toBeInTheDocument();
    expect(screen.getByText(/1 so far/)).toBeInTheDocument();
  });
});
