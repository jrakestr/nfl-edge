import { render, screen } from "@testing-library/react";
import { RosterTable } from "./RosterTable";
import type { RosterRow } from "@/lib/league";

const row = (over: Partial<RosterRow> = {}): RosterRow => ({
  week: 7,
  player: "Bijan Robinson",
  position: "RB",
  nfl_team: "ATL",
  opponent: "SEA",
  slot: "RB",
  status_at_pull: "ACTIVE",
  week_proj: 19.4,
  season_pts: 141.5,
  season_proj: 236.9,
  pulled_at: "2026-10-23T18:03:00Z",
  fp_rank: 2,
  ...over,
});

describe("RosterTable", () => {
  it("renders the current week header, opponent, and upcoming week projection", () => {
    render(<RosterTable rows={[row(), row({ player: "Caleb Williams", position: "QB", nfl_team: "CHI", opponent: null, slot: "QB", week_proj: null })]} weeksDone={6} seasonWeeks={14} rankingsPulledAt="2026-10-23T12:00:00Z" />);
    expect(screen.getByText("Roster (Week 7)")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /Wk 7 proj/ })).toBeInTheDocument();
    expect(screen.getByText("19.4")).toBeInTheDocument();
    expect(screen.getByText("SEA")).toBeInTheDocument();
    expect(screen.getByText("Bye")).toBeInTheDocument();
  });

  it("shows an empty state when no roster rows exist", () => {
    render(<RosterTable rows={[]} weeksDone={6} seasonWeeks={14} rankingsPulledAt={null} />);
    expect(screen.getByText(/Run nfl-edge ingest espn-league to load rosters/)).toBeInTheDocument();
  });
});
