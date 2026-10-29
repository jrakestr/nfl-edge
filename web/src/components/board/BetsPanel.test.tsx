import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Bet, Withheld } from "@/lib/bets";
import { BetsPanel } from "./BetsPanel";

describe("BetsPanel", () => {
  it("Scenario 10: when weekBets returns no bets, shows '0 bets' plus withheld reasons grouped by cause, never an empty box", () => {
    const withheld: Withheld[] = [
      {
        kind: "invariant",
        checkName: "opportunity_totals",
        reason: "failed opportunity_totals on 28 of 28 teams",
        failedTeams: 28,
        totalTeams: 28,
        items: [],
      },
      {
        kind: "gap",
        checkName: "spread_gap_vs_market",
        reason: "model and market differ by more than 4 points; check news",
        failedTeams: 2,
        totalTeams: 14,
        items: [
          { gameId: "2026_07_DAL_PHI", away: "DAL", home: "PHI", edge: 0.251, value: 6.4, threshold: 4 },
        ],
      },
    ];

    render(
      <BetsPanel
        bets={[]}
        withheld={withheld}
        linesAsOf="2026-10-23T12:00:00Z"
        runId="2f2420ae-0000-0000-0000-000000000000"
      />,
    );

    const panel = screen.getByRole("region", { name: "Bets this week" });
    expect(panel).toHaveTextContent("0 bets");
    expect(panel).toHaveTextContent("Run 2f2420 failed opportunity_totals on 28 of 28 teams");
    expect(panel).toHaveTextContent("model and market differ by more than 4 points; check news");
    expect(panel).toHaveTextContent("DAL@PHI +25.1%");
    expect(panel).toHaveTextContent("lines as of");
  });

  it("renders qualifying bets table with stake % and flat 1.0u column", () => {
    const bets: Bet[] = [
      {
        gameId: "2026_07_NE_JAX",
        away: "NE",
        home: "JAX",
        gameday: "2026-10-25",
        gametime: "09:30",
        marketType: "spread",
        side: "home",
        pickLabel: "JAX −3.5",
        line: "−3.5",
        price: -110,
        edge: 0.045,
        modelProb: 0.569,
        marketProb: 0.524,
        kellyFraction: 0.012,
      },
    ];

    render(
      <BetsPanel
        bets={bets}
        withheld={[]}
        linesAsOf="2026-10-24T12:00:00Z"
        runId="45e3b699-0000-0000-0000-000000000000"
      />,
    );

    const table = screen.getByRole("table", { name: "Qualifying bets" });
    expect(within(table).getByText("JAX −3.5")).toBeInTheDocument();
    expect(within(table).getByText("+4.5%")).toBeInTheDocument();
    expect(within(table).getByText("57%")).toBeInTheDocument();
    expect(within(table).getByText("1.2%")).toBeInTheDocument();
    expect(within(table).getByText("1.0u")).toBeInTheDocument();
  });
});
