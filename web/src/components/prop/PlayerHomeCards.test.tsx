import { fireEvent, render, screen } from "@testing-library/react";
import { PlayerHomeCards } from "./PlayerHomeCards";

describe("PlayerHomeCards", () => {
  it("renders Points vs. Projected, performance donuts, Projections bell curve, and Ratings bars", () => {
    render(
      <PlayerHomeCards
        currentSeason={2026}
        actualRows={[
          {
            season: 2026,
            week: 1,
            opponent: "NO",
            gameday: "2026-09-13",
            fpts_dk: 24.4,
            had_opportunity: true,
          },
          {
            season: 2026,
            week: 2,
            opponent: "TB",
            gameday: "2026-09-20",
            fpts_dk: 12.1,
            had_opportunity: true,
          },
          {
            season: 2026,
            week: 3,
            opponent: "ARI",
            gameday: "2026-09-27",
            fpts_dk: 19.8,
            had_opportunity: true,
          },
        ]}
        simProjections={[
          { season: 2026, week: 1, fpts_dk: 18.0, opponent: "NO" },
          { season: 2026, week: 2, fpts_dk: 17.5, opponent: "TB" },
          { season: 2026, week: 3, fpts_dk: 18.5, opponent: "ARI" },
        ]}
        fptsHist={{
          bins: [0, 5, 10, 15, 20, 25, 30],
          counts: [5, 20, 45, 60, 35, 15],
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "Points vs. Projected" })).toBeInTheDocument();
    expect(screen.getByText("Avg +/-")).toBeInTheDocument();
    expect(screen.getByText("Pct Exceed")).toBeInTheDocument();
    expect(screen.getByText("66.7%")).toBeInTheDocument();

    expect(screen.getByText("Player Performance")).toBeInTheDocument();
    expect(screen.getByText("Avg Performance")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Sim Range" })).toBeInTheDocument();
    expect(screen.getByText("Ceiling")).toBeInTheDocument();
    expect(screen.getByText("Floor")).toBeInTheDocument();
    expect(screen.getByText("Pts/Sal")).toBeInTheDocument();

    expect(screen.getByRole("heading", { name: "Ratings" })).toBeInTheDocument();
    expect(screen.getByText("Projected Ceiling")).toBeInTheDocument();
    expect(screen.getByText("Consistency")).toBeInTheDocument();

    // Window toggle works
    fireEvent.click(screen.getByRole("radio", { name: "MONTH" }));
    expect(screen.getByRole("radio", { name: "MONTH" })).toHaveAttribute("data-state", "on");
  });
});
