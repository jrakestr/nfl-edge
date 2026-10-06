import Link from "next/link";
import { Delta } from "@/components/league/Delta";
import { TeamLink } from "@/components/league/TeamLink";
import { EmptyState } from "@/components/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { leagueHref, type LeagueTeamWeek } from "@/lib/league";

function resultLabel(r: LeagueTeamWeek): string {
  if (!r.is_final) return "—";
  return r.win === 1 ? "W" : r.win === 0 ? "L" : "T";
}

/** One team's matchups by week: score, margin against projection, swing, rank, and trend. */
export function TeamMatchups({ rows, season }: { rows: LeagueTeamWeek[]; season: number }) {
  if (rows.length === 0) {
    return <EmptyState title="No matchups yet">This team has no scored weeks. Run nfl-edge ingest espn-league.</EmptyState>;
  }
  const heads = ["Week", "Opponent", "Result", "Luck", "Score", "Opp score", "Vs proj", "Margin", "Swing", "Week rank", "Vs league avg", "Season rank", "Back of top scorer"];
  return (
    <section className="flex flex-col gap-2" aria-label="Matchups by week">
      <div className="card overflow-x-auto">
      <Table>
        <TableHeader className="bg-muted">
          <TableRow className="hover:bg-transparent">
            {heads.map((h, i) => (
              <TableHead key={h} className={`t-colhead text-muted-foreground ${i >= 2 ? "text-right" : ""}`}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.week}>
              <TableCell className="t-body">
                <Link href={leagueHref(`/league/week/${r.week}`, season)} className="font-semibold hover:underline">
                  Week {r.week}
                </Link>
              </TableCell>
              <TableCell className="t-body"><TeamLink id={r.opp_espn_team_id} name={r.opp_team} season={season} /></TableCell>
              <TableCell className="t-body text-right font-semibold">{resultLabel(r)}</TableCell>
              <TableCell className="t-body tnum text-right">{r.luck == null ? "—" : <Delta value={r.luck} kind="wins" digits={2} />}</TableCell>
              <TableCell className="t-body tnum text-right font-semibold">{r.is_final ? r.actual_pts.toFixed(1) : "—"}</TableCell>
              <TableCell className="t-body tnum text-right">{r.is_final ? r.opp_actual_pts.toFixed(1) : "—"}</TableCell>
              <TableCell className="t-body tnum text-right">{r.is_final ? <Delta value={r.own_pm} /> : "—"}</TableCell>
              <TableCell className="t-body tnum text-right">{r.is_final ? <Delta value={r.actual_margin} /> : "—"}</TableCell>
              <TableCell className="t-body tnum text-right">{r.is_final ? <Delta value={r.swing} /> : "—"}</TableCell>
              <TableCell className="t-body tnum text-right">{r.is_final ? r.week_rank : "—"}</TableCell>
              <TableCell className="t-body tnum text-right">
                {r.is_final && r.sd_from_avg != null ? <Delta value={r.sd_from_avg} digits={2} /> : "—"}
              </TableCell>
              <TableCell className="t-body tnum text-right">{r.cum_pf_rank}</TableCell>
              <TableCell className="t-body tnum text-right">{r.pts_back_of_pf_leader === 0 ? "—" : r.pts_back_of_pf_leader.toFixed(1)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </div>
      <p className="t-caption">Luck is that week&apos;s win minus the win the score earned. Open weeks are blank.</p>
    </section>
  );
}
