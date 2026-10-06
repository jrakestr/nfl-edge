import { render, screen } from "@testing-library/react";
import { TransactionsTable } from "./TransactionsTable";
import { groupTransactions, type TxnRow } from "@/lib/league";

const t = (over: Partial<TxnRow>): TxnRow => ({
  id: 1, week: 1, espn_ts: "2026-09-08T00:01:22Z", espn_team_id: 1, team: "Alpha", txn_type: "WAIVER",
  status: "EXECUTED", bid: 25, item_type: "ADD", player: "Zach Charbonnet", group_key: "g1", ...over,
});

describe("TransactionsTable", () => {
  it("groups a waiver claim's add and drop into one row with the bid", () => {
    const groups = groupTransactions([
      t({ id: 1 }),
      t({ id: 2, item_type: "DROP", player: "Najee Harris" }),
    ]);
    render(<TransactionsTable groups={groups} total={2} />);
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByText("Add Zach Charbonnet")).toBeInTheDocument();
    expect(screen.getByText("Drop Najee Harris")).toBeInTheDocument();
    expect(screen.getByText("$25")).toBeInTheDocument();
  });

  it("keeps failed bids visible and names the reason", () => {
    const groups = groupTransactions([t({ status: "FAILED_ROSTERLIMIT", group_key: "f" })]);
    render(<TransactionsTable groups={groups} total={1} />);
    expect(screen.getByText("Failed: roster limit")).toBeInTheDocument();
  });

  it("says which fix applies when the filter hides everything vs when nothing is stored", () => {
    const { rerender } = render(<TransactionsTable groups={[]} total={0} />);
    expect(screen.getByText(/nfl-edge ingest espn-league/)).toBeInTheDocument();
    rerender(<TransactionsTable groups={[]} total={10} />);
    expect(screen.getByText(/Clear the team or type filter/)).toBeInTheDocument();
  });
});
