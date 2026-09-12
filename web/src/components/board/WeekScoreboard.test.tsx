import { render, screen } from "@testing-library/react";
import { WeekScoreboard } from "./WeekScoreboard";

describe("WeekScoreboard", () => {
  it("hides when no graded games", () => {
    const { container } = render(
      <WeekScoreboard
        board={{
          nGames: 0,
          spread: { wins: 0, losses: 0, pushes: 0 },
          total: { wins: 0, losses: 0, pushes: 0 },
          marginMae: null,
          totalMae: null,
        }}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows ATS, totals, and MAE once a game is graded", () => {
    render(
      <WeekScoreboard
        board={{
          nGames: 2,
          spread: { wins: 0, losses: 1, pushes: 1 },
          total: { wins: 0, losses: 2, pushes: 0 },
          marginMae: 13.5,
          totalMae: 20.3,
        }}
      />,
    );
    const box = screen.getByRole("region", { name: "Week scoreboard" });
    expect(box).toHaveTextContent("0–1–1");
    expect(box).toHaveTextContent("0–2–0");
    expect(box).toHaveTextContent("13.5");
    expect(box).toHaveTextContent("20.3");
  });
});
