import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { PropsIndex } from "@/components/props/PropsIndex";
import { FairPropsIndex } from "@/components/props/FairPropsIndex";
import { PropCallout } from "@/components/prop/PropCallout";
import { PropDetail } from "@/components/prop/PropDetail";
import { PlayersList } from "@/components/players/PlayersList";
import type { FairProp, PlayerWeek, PropEdge, WeekPlayer } from "@/lib/types";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/props",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/actions/save-market-line", () => ({
  saveMarketLine: async () => ({ ok: true }),
}));

const EDGE: PropEdge = {
  market_prop_id: 1,
  player_id: "00-0039139",
  player_name: "Jahmyr Gibbs",
  game_id: "2026_01_NO_DET",
  home: "DET",
  away: "NO",
  stat: "rush_yds",
  line: 83.5,
  p_over: 0.225,
  model_prob: 0.225,
  market_prob: 0.5,
  edge: -0.275,
  kelly_fraction: 0,
  price: -110,
  over_odds: -110,
  under_odds: -110,
  sentence: "Gibbs goes over 83.5 rushing yards in 23% of our 20,000 simulated games. At −110 the book is pricing it like a 52% shot.",
  lean: "under",
  typical: 70,
};

const PLAYER: WeekPlayer = {
  player_id: "00-0039139",
  display_name: "Jahmyr Gibbs",
  position: "RB",
  team: "DET",
  game_id: "2026_01_NO_DET",
  fpts_dk_mean: 18.2,
  typical_dk: 22.3,
  hist: { bins: [0, 10, 20], counts: [1, 2] },
};

describe("props-web surfaces", () => {
  it("Props index lists P(over) and links to detail", () => {
    render(<PropsIndex edges={[EDGE]} />);
    expect(screen.getByText("Jahmyr Gibbs")).toBeInTheDocument();
    expect(screen.getByText("23%")).toBeInTheDocument();
    expect(screen.getByText("Rush yds")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Jahmyr Gibbs" })).toHaveAttribute(
      "href",
      "/props/2026_01_NO_DET/00-0039139",
    );
  });

  it("PropCallout renders persisted sentence and lean", () => {
    render(<PropCallout sentence={EDGE.sentence} lean="under" />);
    expect(screen.getByText(/Gibbs goes over 83.5/)).toBeInTheDocument();
    expect(screen.getByText("Lean under")).toBeInTheDocument();
    expect(screen.queryByText("one-sided price, conservative")).toBeNull();
  });

  it("PropCallout labels a one-sided conservative floor", () => {
    render(
      <PropCallout
        sentence="Jennings goes under 2.5 receptions in 50% of our 4 simulated games. Floor −13% (one-sided price, conservative)."
        lean="flat"
        oneSided
      />,
    );
    expect(screen.getAllByText(/one-sided price, conservative/).length).toBeGreaterThan(0);
  });

  it("Fair props board labels a one-sided floor, not an edge", () => {
    const row: FairProp = {
      player_id: "00-0036259",
      player_name: "Jauan Jennings",
      position: "WR",
      team: "MIN",
      opponent: "SF",
      game_id: "2026_01_SF_MIN",
      home: "MIN",
      away: "SF",
      stat: "rec",
      fair_line: 3.5,
      p_over: 0.4,
      p10: 1,
      p25: 2,
      p75: 5,
      p90: 7,
      mean: 3.2,
      sentence: "Our line is 3.5",
      fpts_dk_mean: 8,
      hist: null,
      market_line: 2.5,
      market_p_over: 0.5,
      edge: null,
      lean: "flat",
      over_odds: null,
      under_odds: -170,
      market_sentence: "Floor −13% (one-sided price, conservative).",
      one_sided: true,
      edge_floor: -0.13,
    };
    render(<FairPropsIndex rows={[row]} />);
    expect(screen.getByText("Jauan Jennings")).toBeInTheDocument();
    expect(screen.getByText("−13.0%")).toBeInTheDocument();
    expect(screen.getByText("one-sided price, conservative")).toBeInTheDocument();
    expect(screen.getByLabelText(/Enter a line/)).toBeInTheDocument();
  });

  it("Fair props board names a pruned run and hides the line input", () => {
    const row: FairProp = {
      player_id: "00-0036259",
      player_name: "Jauan Jennings",
      position: "WR",
      team: "MIN",
      opponent: "SF",
      game_id: "2026_01_SF_MIN",
      home: "MIN",
      away: "SF",
      stat: "rec",
      fair_line: 3.5,
      p_over: 0.4,
      p10: 1,
      p25: 2,
      p75: 5,
      p90: 7,
      mean: 3.2,
      sentence: "Our line is 3.5",
      fpts_dk_mean: 8,
      hist: null,
      market_line: null,
      market_p_over: null,
      edge: null,
      lean: null,
      over_odds: null,
      under_odds: null,
      market_sentence: null,
      one_sided: false,
      edge_floor: null,
    };
    render(<FairPropsIndex rows={[row]} drawsPruned />);
    expect(screen.getByRole("status")).toHaveTextContent("draws pruned for this run");
    expect(screen.queryByLabelText(/Enter a line/)).toBeNull();
  });

  it("Players search filters and links to prop detail", () => {
    render(<PlayersList players={[PLAYER]} />);
    expect(screen.getByText("Jahmyr Gibbs")).toBeInTheDocument();
    expect(screen.getByLabelText("RB")).toBeInTheDocument();
    expect(screen.getByText("22.3")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Name or team"), { target: { value: "zzz" } });
    expect(screen.getByText("No projections listed yet")).toBeInTheDocument();
  });
});

const HEADER = {
  gsis_id: "00-0039139",
  display_name: "Jahmyr Gibbs",
  position: "RB",
  latest_team: "DET",
};

const emptyDetail = {
  game: null as null,
  playerId: "00-0039139",
  fairs: [],
  log: [],
  corrs: [],
  matchup: [],
  timeline: [],
  histByStat: {},
  currentSeason: 2026,
};

describe("realized DK on the player card", () => {
  it("labels the source season and games played without repeating a weekly list in the header", () => {
    render(
      <PropDetail
        {...emptyDetail}
        player={HEADER}
        actualRows={[
          {
            season: 2025,
            week: 1,
            opponent: "GB",
            gameday: "2025-09-07",
            fpts_dk: 18.4,
            had_opportunity: true,
          },
        ]}
      />,
    );
    const realized = screen.getByLabelText("Realized DK points");
    expect(realized).toHaveTextContent("2025 DK · 18.4 /g · 1 gp");
    expect(realized.querySelector("ul")).toBeNull();
  });

  it("switches to current season when those games exist", () => {
    render(
      <PropDetail
        {...emptyDetail}
        player={HEADER}
        actualRows={[
          {
            season: 2026,
            week: 1,
            opponent: "NO",
            gameday: "2026-09-13",
            fpts_dk: 22.0,
            had_opportunity: true,
          },
          {
            season: 2025,
            week: 18,
            opponent: "CHI",
            gameday: "2026-01-04",
            fpts_dk: 10.0,
            had_opportunity: true,
          },
        ]}
      />,
    );
    expect(screen.getByLabelText("Realized DK points")).toHaveTextContent("2026 DK");
    expect(screen.queryByText(/2025 DK/)).toBeNull();
  });

  it("says no prior-season data when the id misses", () => {
    render(<PropDetail {...emptyDetail} player={HEADER} playerId="43727325" actualRows={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("No prior-season data");
    expect(screen.queryByLabelText("Realized DK points")).toBeNull();
  });

  it("omits realized DK on DST cards", () => {
    render(
      <PropDetail
        {...emptyDetail}
        player={{ ...HEADER, display_name: "Lions", position: "DST" }}
        actualRows={[
          {
            season: 2025,
            week: 1,
            opponent: "GB",
            gameday: "2025-09-07",
            fpts_dk: 8,
            had_opportunity: true,
          },
        ]}
      />,
    );
    expect(screen.queryByLabelText("Realized DK points")).toBeNull();
    expect(screen.queryByText(/No prior-season data/)).toBeNull();
  });
});

const QB_LOG: PlayerWeek = {
  season: 2026,
  week: 6,
  gameday: "2026-10-12",
  opponent: "NYJ",
  team: "NE",
  home: "NE",
  away: "NYJ",
  home_score: 24,
  away_score: 17,
  stats: {
    passing_yards: 287,
    passing_tds: 2,
    passing_interceptions: 1,
    rushing_yards: 18,
    rushing_tds: 0,
    receptions: 1,
    receiving_yards: 9,
  },
};

describe("player analysis without props", () => {
  it("shows a unified season game log table with scored, sim, FantasyPros, and counting stats when no lines are loaded", () => {
    render(
      <PropDetail
        {...emptyDetail}
        player={{ ...HEADER, position: "QB", latest_team: "NE", display_name: "Drake Maye" }}
        asOf={{ season: 2026, week: 7 }}
        seasonLog={[QB_LOG]}
        actualRows={[
          {
            season: 2026,
            week: 6,
            opponent: "NYJ",
            gameday: "2026-10-12",
            fpts_dk: 23.8,
            had_opportunity: true,
          },
        ]}
        projections={[
          { season: 2026, week: 6, fpts_dk: 21.2, opponent: "NYJ" },
          { season: 2026, week: 7, fpts_dk: 21.1, opponent: "CHI" },
        ]}
        simProjections={[
          { season: 2026, week: 6, fpts_dk: 22.0, opponent: "NYJ" },
          { season: 2026, week: 7, fpts_dk: 20.5, opponent: "CHI" },
        ]}
        games={[{ week: 6, game_id: "2026_06_NYJ_NE" }, { week: 7, game_id: "2026_07_NE_CHI" }]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Season game log" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Scored DK" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Sim DK" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "FantasyPros" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Pass yds" })).toBeInTheDocument();
    expect(screen.getByText("287")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Rec yds" })).toBeNull();
    expect(screen.getByText("23.8")).toBeInTheDocument();
    expect(screen.getByText("22.0")).toBeInTheDocument();
    expect(screen.getByText("+1.8")).toBeInTheDocument();
    expect(screen.getByText(/Projection/)).toBeInTheDocument();
    expect(screen.queryByText("Entered line")).toBeNull();
    expect(screen.queryByRole("region", { name: "Props" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Week" })).toBeInTheDocument();
  });

  it("keeps props as a section when a line is loaded", () => {
    const fair: FairProp = {
      player_id: "00-0039139",
      player_name: "Jahmyr Gibbs",
      position: "RB",
      team: "DET",
      opponent: "NO",
      game_id: "2026_01_NO_DET",
      home: "DET",
      away: "NO",
      stat: "rush_yds",
      fair_line: 70,
      p_over: 0.4,
      p10: 20,
      p25: 40,
      p75: 90,
      p90: 120,
      mean: 68,
      sentence: "Our line is 70",
      fpts_dk_mean: 18,
      hist: null,
      market_line: 83.5,
      market_p_over: 0.5,
      edge: -0.1,
      lean: "under",
      over_odds: -110,
      under_odds: -110,
      market_sentence: "Gibbs goes under.",
    };
    render(
      <PropDetail
        {...emptyDetail}
        player={HEADER}
        fairs={[fair]}
        asOf={{ season: 2026, week: 7 }}
        projections={[]}
      />,
    );
    expect(screen.getByRole("region", { name: "Props" })).toBeInTheDocument();
    expect(screen.getByText("Entered line")).toBeInTheDocument();
    expect(screen.getByText("No 2026 stats before week 7.")).toBeInTheDocument();
  });
});
