import { TeamLink } from "@/components/league/TeamLink";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { viewerRow, type TxnTeamSummary } from "@/lib/league";

const HEADS = ["Team", "Claims won", "FAAB", "Failed", "Pending", "Free agents", "Trades", "Added", "Dropped"];

/** Season transaction rollup, one row per team. Counts come from the log, not ESPN's counters. */
export function TxnSummary({ rows, season }: { rows: TxnTeamSummary[]; season: number }) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-label="Transactions by team">
      <h2 className="t-body font-semibold">By team</h2>
      <div className="card overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow className="hover:bg-transparent">
              {HEADS.map((h, i) => (
                <TableHead key={h} className={`t-colhead text-muted-foreground ${i > 0 ? "text-right" : ""}`}>
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.espn_team_id} {...viewerRow(r.espn_team_id)}>
                <TableCell className="t-body">
                  <TeamLink id={r.espn_team_id} name={r.team} season={season} />
                </TableCell>
                <TableCell className="t-body tnum text-right">{r.waivers}</TableCell>
                <TableCell className="t-body tnum text-right font-semibold">{`$${r.faab}`}</TableCell>
                <TableCell className="t-body tnum text-right">{r.failed}</TableCell>
                <TableCell className="t-body tnum text-right">{r.pending}</TableCell>
                <TableCell className="t-body tnum text-right">{r.freeAgents}</TableCell>
                <TableCell className="t-body tnum text-right">{r.trades}</TableCell>
                <TableCell className="t-body tnum text-right">{r.added}</TableCell>
                <TableCell className="t-body tnum text-right">{r.dropped}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="t-caption">
        A waiver claim counts once, add and drop together, and its bid counts only if the claim executed.
        Draft picks are not in this table.
      </p>
    </section>
  );
}
