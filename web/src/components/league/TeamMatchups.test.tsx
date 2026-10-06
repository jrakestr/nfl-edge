import { render, screen } from "@testing-library/react";
import type { LeagueTeamWeek } from "@/lib/league";
import { TeamMatchups } from "./TeamMatchups";

const row = (over: Partial<LeagueTeamWeek>): LeagueTeamWeek => ({
  season: 2026, week: 4, espn_team_id: 19, team: "Team 19", opp_espn_team_id: 2, opp_team: "Other",
  is_final: true, proj_pts: 110, actual_pts: 120, opp_proj_pts: 100, opp_actual_pts: 90,
  own_pm: 10, opp_pm: -10, proj_margin: 10, actual_margin: 30, swing: 20, win: 1, week_rank: 1,
  league_avg: 100, league_sd: 15, sd_from_avg: 1, allplay_wins: 8, allplay_losses: 3,
  cum_pf: 400, cum_pf_rank: 2, pts_back_of_pf_leader: 12, cum_pa: 380, luck: 0.42, ...over,
});

describe("TeamMatchups", () => {
  it("shows the week's luck and leaves an open week blank", () => {
    render(<TeamMatchups season={2026} rows={[row({}), row({ week: 5, is_final: false, luck: null })]} />);
    expect(screen.getByRole("columnheader", { name: "Luck" })).toBeInTheDocument();
    expect(screen.getByText("+0.42")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });
});
