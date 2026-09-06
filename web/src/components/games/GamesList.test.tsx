import { render, screen } from "@testing-library/react";
import { GamesList, simScore } from "@/components/games/GamesList";
import { fixtureRows } from "@/test/fixture";

describe("simScore", () => {
  it("splits total and spread into away–home points", () => {
    expect(simScore({ mean_total: 48, mean_spread: 6, fair_total: 47, fair_spread: 5 })).toEqual({
      home: 27,
      away: 21,
    });
  });
});

describe("GamesList", () => {
  it("renders matchup and sim score from board rows", () => {
    const rows = fixtureRows().slice(0, 2);
    render(<GamesList week={1} rows={rows} />);
    expect(screen.getByRole("heading", { name: "Games" })).toBeInTheDocument();
    expect(screen.getByText(/Week 1/)).toBeInTheDocument();
    expect(screen.getByText(rows[0].home)).toBeInTheDocument();
    expect(screen.queryByText("No games listed yet")).not.toBeInTheDocument();
  });
});
