import { TeamLink } from "@/components/league/TeamLink";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildWeekGrid, paRanking, viewerRow, type LeagueTeamWeek } from "@/lib/league";

/**
 * Running points against by week, toughest schedule first. The running total comes from the view; a
 * week that is still open shows nothing, because its total would move.
 */
export function PaRunningTable({ rows, season }: { rows: LeagueTeamWeek[]; season: number }) {
  const final = rows.filter((r) => r.is_final);
  if (final.length === 0) return null;
  const grid = buildWeekGrid(final);
  const order = new Map(paRanking(final).map((r, i) => [r.espn_team_id, i]));
  const teams = [...grid.teams].sort((a, b) => order.get(a.espn_team_id)! - order.get(b.espn_team_id)!);
  return (
    <section className="flex flex-col gap-2" aria-label="Running points against">
      <h2 className="t-body font-semibold">Points against, running</h2>
      <div className="card overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow className="hover:bg-transparent">
              <TableHead className="t-colhead text-muted-foreground">Team</TableHead>
              {grid.weeks.map((w) => (
                <TableHead key={w} className="t-colhead text-right text-muted-foreground">
                  Wk {w}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {teams.map((t) => (
              <TableRow key={t.espn_team_id} {...viewerRow(t.espn_team_id)}>
                <TableCell className="t-body">
                  <TeamLink id={t.espn_team_id} name={t.team} season={season} />
                </TableCell>
                {grid.weeks.map((w) => {
                  const c = t.cells.get(w);
                  return (
                    <TableCell key={w} className="t-body tnum text-right">
                      {c ? c.cum_pa.toFixed(1) : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
