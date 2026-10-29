import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { summarizeHistory, type HistoryEntry } from "@/lib/contest-history";
import { ContestHistory } from "./ContestHistory";

const FIXTURE: HistoryEntry[] = [
  {
    contestTime: "2024-10-06T17:00:00Z",
    sport: "NFL",
    gameType: "Classic",
    entryName: "NFL $100K Slant",
    place: 1200,
    points: 118.4,
    winningsCash: 0,
    winningsTicket: 0,
    contestEntries: 12000,
    entryFee: 3,
    placesPaid: 2500,
  },
  {
    contestTime: "2025-11-02T18:00:00Z",
    sport: "NFL",
    gameType: "Classic",
    entryName: "NFL $20K Triple Option (1/3)",
    place: 4,
    points: 186.2,
    winningsCash: 100,
    winningsTicket: 5,
    contestEntries: 2500,
    entryFee: 15,
    placesPaid: 600,
  },
];

describe("ContestHistory", () => {
  it("Scenario 4: renders summary tiles, season/cumulative/fee charts with aria-labels, and size + top-finishes tables", () => {
    const summary = summarizeHistory(FIXTURE, { sport: "NFL", gameType: "Classic" });
    render(<ContestHistory summary={summary} sport="NFL" gameType="Classic" />);

    const tiles = within(screen.getByRole("list", { name: "History summary tiles" })).getAllByRole("listitem");
    expect(tiles).toHaveLength(6);
    expect(tiles[0]).toHaveTextContent("2");
    expect(tiles[1]).toHaveTextContent("$18.00");
    expect(tiles[2]).toHaveTextContent("$105.00");
    expect(tiles[2]).toHaveTextContent("incl. tickets ($5.00)");
    expect(tiles[3]).toHaveTextContent("+$87.00");

    expect(screen.getByRole("img", { name: /Net by season from 2024 to 2025/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Cumulative net through 2025/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "ROI by entry fee bucket" })).toBeInTheDocument();

    expect(screen.getByRole("region", { name: "By contest field size" })).toBeInTheDocument();
    const topTable = screen.getByRole("region", { name: "Top finishes" });
    expect(topTable).toHaveTextContent("NFL $20K Triple Option");
    expect(topTable).toHaveTextContent("$105.00");
  });

  it("Scenario 5: empty history names draftkings-contest-entry-history.csv and nfl-edge ingest dk-folder", () => {
    const empty = summarizeHistory([], { sport: "NFL", gameType: "Classic" });
    render(<ContestHistory summary={empty} sport="NFL" gameType="Classic" />);
    expect(screen.getByText(/draftkings-contest-entry-history\.csv/)).toBeInTheDocument();
    expect(screen.getByText(/nfl-edge ingest dk-folder/)).toBeInTheDocument();
  });
});
