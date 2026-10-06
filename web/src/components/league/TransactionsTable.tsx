import { EmptyState } from "@/components/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { shortStamp } from "@/lib/format";
import { isViewerTeam, txnItemLines, txnStatusLabel, txnTypeLabel, viewerRow, type TxnGroup } from "@/lib/league";
import { cn } from "@/lib/utils";

/**
 * One row per ESPN transaction: items grouped, FAAB bid shown, and failed bids named with the reason
 * ESPN gave. Failed and canceled rows stay visible; they are part of the league's history.
 */
export function TransactionsTable({ groups, total }: { groups: TxnGroup[]; total: number }) {
  if (groups.length === 0) {
    return (
      <EmptyState title="No transactions match">
        {total === 0
          ? "No transactions are stored for this season. Run nfl-edge ingest espn-league."
          : "Clear the team or type filter to see all of them."}
      </EmptyState>
    );
  }
  return (
    <section className="card overflow-x-auto" aria-label="Transactions">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow className="hover:bg-transparent">
            {["When", "Week", "Team", "Type", "Moves", "Bid", "Status"].map((h) => (
              <TableHead key={h} className={`t-colhead text-muted-foreground ${h === "Bid" ? "text-right" : ""}`}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((g) => {
            const failed = g.status.startsWith("FAILED") || g.status === "CANCELED";
            const yours = g.teamIds.some((id) => isViewerTeam(id));
            return (
              <TableRow key={g.key} data-status={failed ? "failed" : "ok"} {...(yours ? viewerRow(g.teamIds.find(isViewerTeam)) : {})}>
                <TableCell className="t-body tnum">{g.ts ? shortStamp(g.ts) : "—"}</TableCell>
                <TableCell className="t-body tnum">{g.week != null && g.week > 0 ? g.week : "—"}</TableCell>
                <TableCell className="t-body">
                  {g.teams.map((name, i) => (
                    <span key={g.teamIds[i] ?? name} className={cn(isViewerTeam(g.teamIds[i]) && "font-semibold text-line")}>
                      {i > 0 ? ", " : ""}
                      {name}
                    </span>
                  ))}
                </TableCell>
                <TableCell className="t-body">{txnTypeLabel(g.txn_type)}</TableCell>
                <TableCell className="t-body">
                  <span className="flex flex-col">
                    {txnItemLines(g).map((l, i) => (
                      <span key={i}>{l}</span>
                    ))}
                  </span>
                </TableCell>
                <TableCell className="t-body tnum text-right">{g.bid != null && g.txn_type === "WAIVER" ? `$${g.bid}` : "—"}</TableCell>
                <TableCell className={failed ? "t-body text-muted-foreground" : "t-body"}>{txnStatusLabel(g.status)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}
