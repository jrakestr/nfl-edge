import { fireEvent, render, screen } from "@testing-library/react";
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

const SHOWDOWN: DfsLineup = {
  lineup_id: "1",
  salary_used: 49800,
  stack: "SEA 4",
  proj_fpts: 90.1,
  sim_win_pct: 0.18,
  sim_roi: 0.22,
  players: [
    { slot: "CPT", name: "Jaxon Smith-Njigba", dk_id: "43782097" },
    { slot: "FLEX", name: "Drake Maye", dk_id: "43782035" },
    { slot: "FLEX2", name: "A.J. Brown", dk_id: "43782036" },
    { slot: "FLEX3", name: "Sam Darnold", dk_id: "43782037" },
    { slot: "FLEX4", name: "Rhamondre Stevenson", dk_id: "43782038" },
    { slot: "FLEX5", name: "Seahawks", dk_id: "43782050" },
  ],
};

describe("LineupCard", () => {
  it("flags a lineup that includes a stale injury dk_id", () => {
    render(<LineupCard lineup={SAMPLE} teams={TEAMS} staleDkIds={new Set(["2"])} />);
    expect(screen.getByText("projected before injury report; rebuild pending")).toBeInTheDocument();
  });

  it("shows last names, win%, and DET stack", () => {
    render(<LineupCard lineup={SAMPLE} teams={TEAMS} />);
    expect(screen.getByText("Gibbs")).toBeInTheDocument();
    expect(screen.getByTitle("Amon-Ra St. Brown")).toHaveTextContent("St. Brown");
    expect(screen.getByText("31%")).toBeInTheDocument();
    expect(screen.getByText("DET")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("does not treat Jr as the last name", () => {
    const lineup: DfsLineup = {
      ...SAMPLE,
      players: [
        ...SAMPLE.players.slice(0, 7),
        { slot: "FLEX", name: "Brian Robinson Jr.", dk_id: "8" },
        SAMPLE.players[8],
      ],
    };
    render(<LineupCard lineup={lineup} />);
    const chip = screen.getByTitle("Brian Robinson Jr.");
    expect(chip).toHaveTextContent("Robinson");
    expect(chip).not.toHaveTextContent("Jr");
  });

  it("FLEX shows the player's real position", () => {
    render(<LineupCard lineup={SAMPLE} positions={{ "bijan robinson": "RB" }} />);
    const flex = screen.getByTitle("Bijan Robinson");
    expect(flex).toHaveTextContent("RB");
    expect(flex).toHaveTextContent("Robinson");
  });

  it("labels the captain slot on showdown", () => {
    render(<LineupCard slate="showdown" lineup={SHOWDOWN} />);
    expect(screen.getByText("CPT Smith-Njigba")).toBeInTheDocument();
    expect(screen.getByText("Maye")).toBeInTheDocument();
    expect(screen.queryByText("QB")).not.toBeInTheDocument();
  });

  it("hides win% and ROI when hideSimStats is set", () => {
    render(<LineupCard lineup={SAMPLE} hideSimStats />);
    expect(screen.queryByText("Win %")).not.toBeInTheDocument();
    expect(screen.queryByText("31%")).not.toBeInTheDocument();
    expect(screen.queryByText("ROI")).not.toBeInTheDocument();
  });

  it("shows one decimal on sub-1% win rates", () => {
    render(
      <LineupCard
        slate="showdown"
        lineup={{ ...SHOWDOWN, sim_win_pct: 0.0046 }}
      />,
    );
    expect(screen.getByText("0.5%")).toBeInTheDocument();
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
  });
});

describe("stacksFromPlayers", () => {
  it("counts teammates at 2+", () => {
    const stacks = stacksFromPlayers(SAMPLE.players, TEAMS);
    expect(stacks[0]).toEqual({ team: "DET", count: 7 });
  });
});

describe("LineupReview construction", () => {
  it("filters by construction, names the method, and has no Pick one", () => {
    const cash: DfsLineup = { ...SAMPLE, lineup_id: "c1", construction: "cash", proj_fpts: 99 };
    const mass: DfsLineup = { ...SAMPLE, lineup_id: "m1", construction: "mass" };
    render(
      <LineupReview
        week="2"
        site="dk"
        slate="main"
        runId="bda9aaf4-032b-4380-ab3a-6634696525eb"
        slateId="2026_02_main"
        lineups={[cash, mass]}
        teams={TEAMS}
      />,
    );
    expect(screen.queryByRole("heading", { name: "Pick one" })).not.toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Construction" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mass GPP" })).toBeInTheDocument();
    expect(screen.getByText(/Mass GPP · 1 lineup/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cash" }));
    expect(screen.getByText(/Cash · 1 lineup/)).toBeInTheDocument();
    expect(screen.queryByText("Win %")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export this lineup" })).toBeInTheDocument();
  });
});

describe("LineupReview with data", () => {
  it("shows persisted optimizer settings instead of dashes", () => {
    render(
      <LineupReview
        week="1"
        site="dk"
        slate="afternoon"
        runId="bda9aaf4-032b-4380-ab3a-6634696525eb"
        slateId="2026_01_afternoon"
        lineups={[SAMPLE]}
        settings={{ randomness: 25, stacksPct: 65, maxExposure: 40, numUniques: 3 }}
      />,
    );
    expect(screen.getByText("Randomness 25")).toBeInTheDocument();
    expect(screen.getByText("Stacks 65%")).toBeInTheDocument();
    expect(screen.getByText("Max exposure 40%")).toBeInTheDocument();
    expect(screen.queryByText("Max exposure —")).not.toBeInTheDocument();
  });

  it("lists the lineup and enables export after select", () => {
    render(
      <LineupReview
        week="1"
        site="dk"
        slate="main"
        runId="bda9aaf4-032b-4380-ab3a-6634696525eb"
        slateId="2026_01_main"
        lineups={[SAMPLE]}
        exposure={[{ player_id: "g", name: "Jahmyr Gibbs", team: "DET", own_ours: 0.4, own_field_proj: 0.25, own_field_sim: 0.2, leverage: 0.2 }]}
        teams={TEAMS}
      />,
    );
    expect(screen.getByRole("heading", { name: "Week 1 · DK · main" })).toBeInTheDocument();
    expect(screen.getByText("Gibbs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export selected" })).toBeDisabled();
    expect(screen.getByLabelText("Jahmyr Gibbs exposure")).toBeInTheDocument();
  });

  it("hides pre-migration exposure that has no own_field_sim", () => {
    render(
      <LineupReview
        week="1"
        site="dk"
        slate="main"
        runId="bda9aaf4-032b-4380-ab3a-6634696525eb"
        slateId="2026_01_main"
        lineups={[SAMPLE]}
        exposure={[{ player_id: "g", name: "Jahmyr Gibbs", team: "DET", own_ours: 0.4, own_field_proj: 0.25, own_field_sim: null, leverage: 0.2 }]}
        teams={TEAMS}
      />,
    );
    expect(screen.getByText("Exposure not recomputed for this run.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Jahmyr Gibbs exposure")).not.toBeInTheDocument();
  });

  it("notes Sunday build in progress when the new run has no lineups", () => {
    render(
      <LineupReview
        week="1"
        site="dk"
        slate="main"
        runId="aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
        slateId="2026_01_main"
        lineups={[SAMPLE]}
        teams={TEAMS}
        buildInProgress
      />,
    );
    expect(screen.getByRole("note")).toHaveTextContent("Sunday build in progress");
  });
});
