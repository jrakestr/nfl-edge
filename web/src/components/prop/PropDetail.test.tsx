import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { PropsIndex } from "@/components/props/PropsIndex";
import { PropCallout } from "@/components/prop/PropCallout";
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
