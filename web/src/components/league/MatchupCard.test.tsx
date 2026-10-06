import { render, screen } from "@testing-library/react";
import { MatchupCard } from "./MatchupCard";
import { StarterMisses } from "./StarterMisses";
import type { LeagueTeamWeek, StarterRow } from "@/lib/league";

const side = (over: Partial<LeagueTeamWeek>): LeagueTeamWeek => ({
  season: 2026, week: 4, espn_team_id: 1, team: "Alpha", opp_espn_team_id: 2, opp_team: "Bravo",
  is_final: true, proj_pts: 120, actual_pts: 130, opp_proj_pts: 110, opp_actual_pts: 100,
  own_pm: 10, opp_pm: -10, proj_margin: 10, actual_margin: 30, swing: 20, win: 1, week_rank: 1,
  league_avg: 110, league_sd: 20, sd_from_avg: 1, allplay_wins: 11, allplay_losses: 0, cum_pf: 130,
  cum_pf_rank: 1, pts_back_of_pf_leader: 0, cum_pa: 100, luck: null, ...over,
});

describe("MatchupCard", () => {
  it("names the swing and who it favored", () => {
    render(<MatchupCard season={2026} a={side({})} b={side({ espn_team_id: 2, team: "Bravo", swing: -20, own_pm: -10, actual_pts: 100, proj_pts: 110, proj_margin: -10, actual_margin: -30 })} />);
    expect(screen.getByText(/Swing 20\.0 toward Alpha/)).toBeInTheDocument();
  });

  it("shows no result while a side is open", () => {
    render(<MatchupCard season={2026} a={side({ is_final: false })} b={side({ espn_team_id: 2, team: "Bravo", swing: -20 })} />);
    expect(screen.getByText(/In progress/)).toBeInTheDocument();
    expect(screen.queryByText("130.0")).not.toBeInTheDocument();
  });
});

const starter = (over: Partial<StarterRow>): StarterRow => ({
  espn_team_id: 1, team: "Alpha", player: "Pat Player", position: "WR", nfl_team: "KC", slot: "WR",
  proj_pts: 18, actual_pts: 3, kickoff: "2026-10-04T17:00:00Z", snapshot_status: null, snapshot_pulled_at: null,
  fp_matched: false, fp_status: null, practice_1: null, practice_2: null, practice_3: null,
  probability_of_playing: null, injury_update_date: null, known_before_kickoff: null, fp_fetched_at: null,
  fp_points: null, ...over,
});

describe("StarterMisses", () => {
  it("says there is no snapshot before kickoff instead of implying health", () => {
    render(<StarterMisses season={2026} weekFinal starters={[starter({})]} checks={[]} />);
    expect(screen.getByText("no snapshot before kickoff")).toBeInTheDocument();
    expect(screen.getByText("Not on the FantasyPros report")).toBeInTheDocument();
  });

  it("shows the snapshot status and its time when one exists", () => {
    render(
      <StarterMisses
        season={2026}
        weekFinal
        starters={[starter({ snapshot_status: "QUESTIONABLE", snapshot_pulled_at: "2026-10-04T12:00:00Z" })]}
        checks={[]}
      />,
    );
    expect(screen.getByText("Q as of Sun 08:00")).toBeInTheDocument();
  });

  it("does not claim a miss list for a week that is still open", () => {
    render(<StarterMisses season={2026} weekFinal={false} starters={[starter({})]} checks={[]} />);
    expect(screen.getByText(/appear when every game this week is final/)).toBeInTheDocument();
    expect(screen.queryByText("Pat Player")).not.toBeInTheDocument();
  });

  it("reports an empty miss list plainly", () => {
    render(<StarterMisses season={2026} weekFinal starters={[starter({ actual_pts: 17 })]} checks={[]} />);
    expect(screen.getByText(/No starter scored 10 or more points under projection/)).toBeInTheDocument();
  });
});
