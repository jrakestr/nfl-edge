import { fireEvent, render, screen } from "@testing-library/react";
import type { StripGame } from "@/lib/kickoff";
import { GameStrip } from "./GameStrip";
import { GamesSelectionProvider } from "./GamesSelection";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/week/1/players/dk/main",
  useSearchParams: () => new URLSearchParams(),
}));

function g(over: Partial<StripGame> & { game_id: string; away: string; home: string }): StripGame {
  return {
    gameday: "2026-09-13",
    gametime: "13:00",
    location: "Home",
    away_score: null,
    home_score: null,
    is_final: false,
    ...over,
  };
}

const GAMES: StripGame[] = [
  g({ game_id: "2026_01_KC_LAC", away: "KC", home: "LAC", gametime: "13:00" }),
  g({ game_id: "2026_01_BUF_BAL", away: "BUF", home: "BAL", gametime: "13:00" }),
  g({ game_id: "2026_01_DAL_NYG", away: "DAL", home: "NYG", gametime: "16:25" }),
  g({
    game_id: "2026_01_DEN_IND",
    away: "DEN",
    home: "IND",
    gameday: "2026-09-10",
    gametime: "20:15",
    away_score: 7,
    home_score: 24,
    is_final: true,
  }),
];

function renderStrip() {
  return render(
    <GamesSelectionProvider>
      <GameStrip games={GAMES} />
    </GamesSelectionProvider>,
  );
}

describe("GameStrip", () => {
  it("groups windows with counts and shows Final on a completed game", () => {
    renderStrip();
    expect(screen.getByRole("button", { name: /1:00 2/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /4:05\/4:25 1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /primetime 1/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "DEN at IND" })).toHaveTextContent("7–24 Final");
  });

  it("toggles a chip, window-selects, and Clear games", () => {
    renderStrip();
    const kc = screen.getByRole("button", { name: "KC at LAC" });
    fireEvent.click(kc);
    expect(kc).toHaveAttribute("aria-pressed", "true");
    expect(kc).toHaveClass("bg-foreground");
    fireEvent.click(screen.getByRole("button", { name: /1:00 2/ }));
    expect(screen.getByRole("button", { name: "BUF at BAL" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Clear games" }));
    expect(kc).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("button", { name: "Clear games" })).toBeNull();
  });
});
