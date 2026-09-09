import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { PropsIndex } from "@/components/props/PropsIndex";
import { PropCallout } from "@/components/prop/PropCallout";
import { PlayersList } from "@/components/players/PlayersList";
import type { PropEdge, SlatePlayer } from "@/lib/types";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/week/1/players/dk/main",
  useSearchParams: () => new URLSearchParams(),
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

const PLAYER: SlatePlayer = {
  player_id: "00-0039139",
  dk_id: "43791002",
  display_name: "Jahmyr Gibbs",
  position: "RB",
  team: "DET",
  salary: 7800,
  game_info: "NO@DET 09/07/2026 01:00PM ET",
  game_id: "2026_01_NO_DET",
  fpts_dk_mean: 18.2,
  fpts_dk_sd: 4,
  typical_dk: 22.3,
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
    render(<PlayersList week="1" site="dk" slate="main" players={[PLAYER]} />);
    expect(screen.getByText("Jahmyr Gibbs")).toBeInTheDocument();
    expect(screen.getByLabelText("RB")).toBeInTheDocument();
    expect(screen.getByText("18.2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lock Jahmyr Gibbs" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Jahmyr Gibbs" })).toHaveAttribute(
      "href",
      "/props/2026_01_NO_DET/00-0039139",
    );
    fireEvent.change(screen.getByPlaceholderText("Name or team"), { target: { value: "zzz" } });
    expect(screen.getByText("No players on this slate yet")).toBeInTheDocument();
  });
});
