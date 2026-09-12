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

  it("keeps the points row and says not on this run when priors are missing", () => {
    render(<GameWhy row={row()} runCreatedAt="2026-09-12T18:00:00.000Z" />);
    const why = screen.getByRole("region", { name: "Why" });
    expect(why).toHaveTextContent("Mean points");
    expect(why).toHaveTextContent("not on this run");
    expect(why).not.toHaveTextContent("former starter");
    expect(why).not.toHaveTextContent("lookback quarterback");
  });

  it("labels most attempts in lookback and marks a starter who is not that player", () => {
    render(
      <GameWhy
        row={row()}
        runCreatedAt="2026-09-12T18:00:00.000Z"
        inputs={{
          MIA: {
            team: "MIA",
            off_ppd_raw: 2.0,
            off_ppd_adj: 2.1,
            def_ppd_allowed: 2.05,
            drives_mean: 11.2,
            league_off_ppd: 2.13,
            league_def_ppd_allowed: 2.13,
            qb_starter_id: "Watson",
            qb_starter_name: "Deshaun Watson",
            qb_lookback_id: "Willis",
            qb_lookback_name: "Tua Tagovailoa",
            qb_lookback_att: 35,
            qb_starter_att: 0,
            qb_pass_factor: 1.0,
          },
        }}
      />,
    );
    const why = screen.getByRole("region", { name: "Why" });
    const away = within(why).getByText("MIA").closest("[data-side]")!;
    expect(away).toHaveTextContent("Deshaun Watson");
    expect(away).toHaveTextContent("Most attempts in lookback");
    expect(away).toHaveTextContent("Tua Tagovailoa · 35 att");
    expect(away).toHaveTextContent("0");
    expect(away).toHaveTextContent("1.000");
    expect(away).toHaveTextContent("starter differs from most attempts in lookback");
    expect(away).toHaveTextContent("2.10 · league 2.13");
    expect(away).toHaveTextContent("11.2");
    const home = within(why).getByText("LV").closest("[data-side]")!;
    expect(home).toHaveTextContent("not on this run");
    expect(home).toHaveTextContent("Mean points");
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
