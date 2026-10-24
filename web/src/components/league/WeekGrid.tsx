import Link from "next/link";
import { Delta } from "@/components/league/Delta";
import { TeamLink } from "@/components/league/TeamLink";
import { EmptyState } from "@/components/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildWeekGrid, leagueHref, teamFinalMean, viewerRow, type LeagueTeamWeek } from "@/lib/league";

/** Each team's actual minus projected points, one column per week. Open weeks show an em dash. */
export function WeekGrid({ rows, season }: { rows: LeagueTeamWeek[]; season: number }) {
  if (rows.length === 0) {
    return <EmptyState title="No weeks to show">Run nfl-edge ingest espn-league to load the league.</EmptyState>;
  }
  const grid = buildWeekGrid(rows);
  return (
    <section className="card overflow-x-auto" aria-label="Actual minus projected by week">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow className="hover:bg-transparent">
            <TableHead className="t-colhead text-muted-foreground">Team</TableHead>
            {grid.weeks.map((w) => (
              <TableHead key={w} className="t-colhead text-right text-muted-foreground">
                <Link href={leagueHref(`/league/week/${w}`, season)} className="hover:text-foreground" aria-label={`Week ${w}`}>
                  Wk {w}
                </Link>
              </TableHead>
            ))}
            <TableHead className="border-l border-border-soft t-colhead text-right text-muted-foreground">
              Avg
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {grid.teams.map((t) => {
            const avg = teamFinalMean(t.cells, (c) => c.own_pm);
            return (
              <TableRow key={t.espn_team_id} {...viewerRow(t.espn_team_id)}>
                <TableCell className="t-body">
                  <TeamLink id={t.espn_team_id} name={t.team} season={season} />
                </TableCell>
                {grid.weeks.map((w) => {
                  const c = t.cells.get(w);
                  return (
                    <TableCell key={w} className="t-body tnum text-right">
                      {c && c.is_final ? <Delta value={c.own_pm} /> : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                  );
                })}
                <TableCell className="border-l border-border-soft t-body tnum text-right font-semibold">
                  {avg != null ? <Delta value={avg} /> : <span className="text-muted-foreground">—</span>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}
