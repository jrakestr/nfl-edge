import { render, screen } from "@testing-library/react";
import { WeekGrid } from "./WeekGrid";
import { PaRunningTable } from "./PaRunningTable";
import type { LeagueTeamWeek } from "@/lib/league";

const tw = (over: Partial<LeagueTeamWeek>): LeagueTeamWeek => ({
  season: 2026,
  week: 1,
  espn_team_id: 1,
  team: "Alpha",
  opp_espn_team_id: 2,
  opp_team: "Bravo",
  is_final: true,
  proj_pts: 100,
  actual_pts: 112,
  opp_proj_pts: 100,
  opp_actual_pts: 90,
  own_pm: 12,
  opp_pm: -10,
  proj_margin: 0,
  actual_margin: 22,
  swing: 22,
  win: 1,
  week_rank: 1,
  league_avg: 100,
  league_sd: 20,
  sd_from_avg: 0.6,
  allplay_wins: 8,
  allplay_losses: 3,
  cum_pf: 112,
  cum_pf_rank: 1,
  pts_back_of_pf_leader: 0,
  cum_pa: 90,
  luck: null,
  ...over,
});

const rows = [
  tw({ week: 1 }),
  tw({ week: 2, own_pm: -8, cum_pa: 190 }),
  tw({ week: 2, espn_team_id: 2, team: "Bravo", is_final: false, own_pm: 3, cum_pa: 80 }),
  tw({ week: 1, espn_team_id: 2, team: "Bravo", own_pm: -10, cum_pa: 112 }),
];

describe("WeekGrid", () => {
  it("shows actual minus projected per week, colored by direction", () => {
    const { container } = render(<WeekGrid rows={rows} season={2026} />);
    const colored = [...container.querySelectorAll("[data-edge]")].map((e) => e.textContent);
    expect(colored).toEqual(["+12.0", "−8.0", "−10.0"]);
  });

  it("shows an em dash for a week still in progress", () => {
    render(<WeekGrid rows={rows} season={2026} />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });

  it("links each week header to its week page", () => {
    render(<WeekGrid rows={rows} season={2026} />);
    expect(screen.getByRole("link", { name: "Week 2" })).toHaveAttribute("href", "/league/week/2");
  });

  it("says what is missing when there are no weeks", () => {
    render(<WeekGrid rows={[]} season={2026} />);
    expect(screen.getByText(/nfl-edge ingest espn-league/)).toBeInTheDocument();
  });
});

describe("PaRunningTable", () => {
  it("orders teams by points against through the last final week and skips open weeks", () => {
    render(<PaRunningTable rows={rows} season={2026} />);
    const teams = screen.getAllByRole("row").slice(1).map((r) => r.querySelector("a")?.textContent);
    expect(teams).toEqual(["Alpha", "Bravo"]);
    expect(screen.getByText("190.0")).toBeInTheDocument();
    expect(screen.queryByText("80.0")).not.toBeInTheDocument();
  });
});
