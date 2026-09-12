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
  it("shows 12 of 16 games on this slate", () => {
    const rows = fixtureRows().slice(0, 12);
    render(<GamesList week={1} rows={rows} weekTotal={16} />);
    expect(screen.getByText(/12 of 16 games on this slate/)).toBeInTheDocument();
    expect(screen.queryByText(fixtureRows()[12]!.home)).not.toBeInTheDocument();
  });

  it("renders matchup and sim score from board rows", () => {
    const rows = fixtureRows().slice(0, 2);
    rows[0] = { ...rows[0], ngs_away_pts: 28.1, ngs_home_pts: 30.2, ngs_p_home_win: 0.572 };
    render(<GamesList week={1} rows={rows} />);
    expect(screen.getByRole("heading", { name: "Games" })).toBeInTheDocument();
    expect(screen.getByText(/Week 1/)).toBeInTheDocument();
    expect(screen.getByText(rows[0].home)).toBeInTheDocument();
    expect(screen.getByText(/NFLGameSim 28.1–30.2/)).toBeInTheDocument();
    expect(screen.queryByText("No games listed yet")).not.toBeInTheDocument();
  });

  it("shows the final score and hides the week scoreboard when nothing is graded", () => {
    const live = fixtureRows()[0]!;
    const fin = {
      ...fixtureRows()[1]!,
      has_started: true,
      is_final: true,
      away_score: 10,
      home_score: 13,
      result: 3,
    };
    render(
      <GamesList
        week={1}
        rows={[live, fin]}
        scoreboard={{
          nGames: 1,
          spread: { wins: 0, losses: 0, pushes: 1 },
          total: { wins: 0, losses: 1, pushes: 0 },
          marginMae: 1.9,
          totalMae: 22.3,
        }}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Result" })).toBeInTheDocument();
    expect(screen.getByText(`${fin.away} ${fin.away_score} – ${fin.home} ${fin.home_score}`)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Week scoreboard" })).toHaveTextContent("0–0–1");
  });
});
