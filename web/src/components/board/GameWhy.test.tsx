import { render, screen, within } from "@testing-library/react";
import { GameWhy } from "./GameWhy";
import { fixtureRows } from "@/test/fixture";

function row(over: Partial<ReturnType<typeof fixtureRows>[number]> = {}) {
  return {
    ...fixtureRows()[0]!,
    mean_total: 48,
    mean_spread: 6,
    fair_total: 48,
    fair_spread: 6,
    total_line: 48,
    spread_line: 3,
    run_market_total: 48,
    run_market_spread: 3.5,
    captured_at: "2026-09-12T20:00:00.000Z",
    away: "MIA",
    home: "LV",
    ...over,
  };
}

describe("GameWhy", () => {
  it("labels current implied totals and the run market when the line moved", () => {
    render(<GameWhy row={row()} runCreatedAt="2026-09-12T18:00:00.000Z" />);
    const why = screen.getByRole("region", { name: "Why" });
    const away = within(why).getByText("MIA").closest("[data-side]")!;
    expect(away).toHaveTextContent("Mean points");
    expect(away).toHaveTextContent("21.0");
    expect(away).toHaveTextContent("Market as of Sat 16:00");
    expect(away).toHaveTextContent("22.5");
    expect(away).toHaveTextContent("Market at run Sat 14:00");
    expect(away).toHaveTextContent("Difference vs current");
    expect(away).toHaveTextContent("−1.5");
  });

  it("omits the run market row when the line has not moved", () => {
    render(
      <GameWhy
        row={row({ run_market_spread: 3, run_market_total: 48, spread_line: 3, total_line: 48 })}
        runCreatedAt="2026-09-12T18:00:00.000Z"
      />,
    );
    const why = screen.getByRole("region", { name: "Why" });
    expect(why).toHaveTextContent("as of Sat 16:00");
    expect(why).not.toHaveTextContent("at run");
  });
});
