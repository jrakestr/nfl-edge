import { EmptyState } from "@/components/EmptyState";
import { TxnWeekTabs } from "@/components/league/TxnWeekTabs";
import type { TxnGroup } from "@/lib/league";

/**
 * One team's moves, one week at a time. A trade stays whole, so the other team still appears on the row.
 */
export function TeamTransactions({
  groups,
  stored,
  weeks,
}: {
  groups: TxnGroup[];
  stored: boolean;
  weeks: number[];
}) {
  return (
    <section className="flex flex-col gap-2" aria-label="Transactions">
      <h2 className="t-body font-semibold">Transactions</h2>
      {groups.length === 0 ? (
        <EmptyState title={stored ? "No transactions for this team" : "No transactions stored"}>
          {stored
            ? "Adds, drops, waivers, and trades for this team show here."
            : "Run nfl-edge ingest espn-league to load the league."}
        </EmptyState>
      ) : (
        <TxnWeekTabs weeks={weeks} groups={groups} />
      )}
    </section>
  );
}
