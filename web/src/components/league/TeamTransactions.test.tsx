import { fireEvent, render, screen } from "@testing-library/react";
import { groupTransactions, type TxnRow } from "@/lib/league";
import { TeamTransactions } from "./TeamTransactions";

const t = (over: Partial<TxnRow>): TxnRow => ({
  id: 1, week: 3, espn_ts: "2026-09-24T00:01:22Z", espn_team_id: 19, team: "Team 19", txn_type: "WAIVER",
  status: "EXECUTED", bid: 12, item_type: "ADD", player: "Jaylen Waddle", group_key: "g1", ...over,
});

describe("TeamTransactions", () => {
  it("opens the latest week and keeps the others behind tabs", () => {
    render(<TeamTransactions groups={groupTransactions([t({})])} stored weeks={[1, 3]} />);
    expect(screen.getByRole("tab", { name: "Week 3", selected: true })).toBeInTheDocument();
    expect(screen.getByText("Add Jaylen Waddle")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Week 1" }));
    expect(screen.getByText("No transactions this week.")).toBeInTheDocument();
    expect(screen.queryByText("Add Jaylen Waddle")).not.toBeInTheDocument();
  });

  it("names an empty team separately from an empty league", () => {
    const { rerender } = render(<TeamTransactions groups={[]} stored weeks={[]} />);
    expect(screen.getByText("No transactions for this team")).toBeInTheDocument();
    rerender(<TeamTransactions groups={[]} stored={false} weeks={[]} />);
    expect(screen.getByText(/nfl-edge ingest espn-league/)).toBeInTheDocument();
  });
});
