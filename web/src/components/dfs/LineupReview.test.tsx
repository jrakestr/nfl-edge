import { render, screen } from "@testing-library/react";
import { LineupCard, stacksFromPlayers } from "@/components/dfs/LineupCard";
import { LineupReview } from "@/components/dfs/LineupReview";
import type { DfsLineup } from "@/lib/types";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/lib/actions/dfs-export", () => ({
  exportSelectedLineups: async () => "",
}));

const SAMPLE: DfsLineup = {
  lineup_id: "34",
  salary_used: 50000,
  stack: "DET 3",
  proj_fpts: 116.9,
  sim_win_pct: 0.31,
  sim_roi: 0.12,
  players: [
    { slot: "QB", name: "Jared Goff", dk_id: "1" },
    { slot: "RB", name: "Jahmyr Gibbs", dk_id: "2" },
    { slot: "RB2", name: "David Montgomery", dk_id: "3" },
    { slot: "WR", name: "Amon-Ra St. Brown", dk_id: "4" },
    { slot: "WR2", name: "Jameson Williams", dk_id: "5" },
    { slot: "WR3", name: "Chris Olave", dk_id: "6" },
    { slot: "TE", name: "Sam LaPorta", dk_id: "7" },
    { slot: "FLEX", name: "Bijan Robinson", dk_id: "8" },
    { slot: "DST", name: "Lions", dk_id: "9" },
  ],
};

const TEAMS = {
  "jared goff": "DET",
  "jahmyr gibbs": "DET",
  "david montgomery": "DET",
  "amon-ra st. brown": "DET",
  "jameson williams": "DET",
  "chris olave": "NO",
  "sam laporta": "DET",
  "bijan robinson": "ATL",
  lions: "DET",
};

describe("LineupCard", () => {
  it("shows last names, win%, and DET stack", () => {
    render(<LineupCard lineup={SAMPLE} teams={TEAMS} />);
    expect(screen.getByText("Gibbs")).toBeInTheDocument();
    expect(screen.getByText("31%")).toBeInTheDocument();
    expect(screen.getByText("DET 7")).toBeInTheDocument();
  });
});

describe("stacksFromPlayers", () => {
  it("counts teammates at 2+", () => {
    const stacks = stacksFromPlayers(SAMPLE.players, TEAMS);
    expect(stacks[0]).toEqual({ team: "DET", count: 7 });
  });
});

describe("LineupReview with data", () => {
  it("lists the lineup and enables export after select", () => {
    render(
      <LineupReview
        week="1"
        site="dk"
        slate="main"
        runId="bda9aaf4-032b-4380-ab3a-6634696525eb"
        slateId="2026_01_main"
        lineups={[SAMPLE]}
        exposure={[{ player_id: "g", name: "Jahmyr Gibbs", team: "DET", sim_own: 0.4, proj_own: 0.2, leverage: 0.2 }]}
        teams={TEAMS}
      />,
    );
    expect(screen.getByRole("heading", { name: "Week 1 · DK · main" })).toBeInTheDocument();
    expect(screen.getByText("Gibbs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export selected" })).toBeDisabled();
    expect(screen.getByLabelText("Jahmyr Gibbs exposure")).toBeInTheDocument();
  });
});
