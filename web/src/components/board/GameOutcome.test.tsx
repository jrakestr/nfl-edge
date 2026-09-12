import { render, screen } from "@testing-library/react";
import { fixtureRows } from "@/test/fixture";
import { GameOutcome } from "./GameOutcome";

function base() {
  return fixtureRows()[0]!;
}

describe("GameOutcome", () => {
  it("shows in progress when the game has started but is not final", () => {
    render(<GameOutcome row={{ ...base(), has_started: true, is_final: false }} />);
    expect(screen.getByText("In progress")).toBeInTheDocument();
    expect(screen.queryByText(/Margin/)).toBeNull();
  });

  it("shows score, margin vs model, and graded markets on a final", () => {
    render(
      <GameOutcome
        row={{
          ...base(),
          home: "SEA",
          away: "NE",
          home_score: 13,
          away_score: 10,
          result: 3,
          mean_spread: 4.89,
          mean_total: 45.34,
          is_final: true,
          has_started: true,
          graded: {
            spread: { side: "home", outcome: null, clv: 0 },
            total: { side: "over", outcome: 0, clv: 0 },
            moneyline: { side: "home", outcome: 1, clv: null },
          },
        }}
      />,
    );
    expect(screen.getByText("NE 10 – SEA 13")).toBeInTheDocument();
    expect(screen.getByText(/Margin/)).toBeInTheDocument();
    expect(screen.getByText("Push")).toBeInTheDocument();
    expect(screen.getByText("Lost")).toBeInTheDocument();
    expect(screen.getByText("Won")).toBeInTheDocument();
  });
});
