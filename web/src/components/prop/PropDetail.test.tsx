import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { PropsIndex } from "@/components/props/PropsIndex";
import { PropCallout } from "@/components/prop/PropCallout";
import { PropDetail } from "@/components/prop/PropDetail";
import { PlayersList } from "@/components/players/PlayersList";
import type { PropEdge, WeekPlayer } from "@/lib/types";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
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
  it("labels the source season and games played", () => {
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
    expect(screen.getByLabelText("Realized DK points")).toHaveTextContent("2025 DK · 18.4 /g · 1 gp");
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
