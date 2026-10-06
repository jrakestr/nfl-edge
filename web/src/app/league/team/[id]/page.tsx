import { EmptyState } from "@/components/EmptyState";
import { LeagueHeader } from "@/components/league/LeagueHeader";
import { RosterTable } from "@/components/league/RosterTable";
import { TeamHeader } from "@/components/league/TeamHeader";
import { TeamMatchups } from "@/components/league/TeamMatchups";
import { TeamTransactions } from "@/components/league/TeamTransactions";
import { TeamTrend } from "@/components/league/TeamTrend";
import { filterTransactions, groupTransactions, parseSeason, parseTeamId, rosterTotals } from "@/lib/league";
import {
  leagueClock,
  leagueLuck,
  leagueRoster,
  leagueStandings,
  leagueTeams,
  leagueTeamWeeks,
  leagueTransactions,
} from "@/lib/queries/league";

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: PageProps<"/league/team/[id]">) {
  const season = parseSeason((await searchParams).season);
  const id = parseTeamId((await params).id);
  const teams = await leagueTeams(season);
  const team = id == null ? undefined : teams.find((t) => t.espn_team_id === id);
  if (id == null || !team) {
    return (
      <>
        <LeagueHeader season={season} />
        <EmptyState title="No such team in this league">
          {teams.length > 0
            ? `Team ids: ${teams.map((t) => t.espn_team_id).join(", ")}.`
            : "Run nfl-edge ingest espn-league to load the league."}
        </EmptyState>
      </>
    );
  }
  const [standings, luck, rows, roster, txns, clock] = await Promise.all([
    leagueStandings(season),
    leagueLuck(season),
    leagueTeamWeeks(season, { teamId: id }),
    leagueRoster(season, id),
    leagueTransactions(season),
    leagueClock(season),
  ]);
  const groups = groupTransactions(filterTransactions(txns, { team: id, type: null }));
  const idx = standings.findIndex((s) => s.espn_team_id === id);
  const totals = rosterTotals(roster.rows);
  return (
    <>
      <TeamHeader
        team={team}
        standing={idx >= 0 ? standings[idx]! : null}
        rank={idx >= 0 ? idx + 1 : null}
        luck={luck.rows.find((l) => l.espn_team_id === id) ?? null}
        rosterPts={totals?.pts ?? null}
        rosterProj={totals?.proj ?? null}
        weeksDone={clock.weeksDone}
        seasonWeeks={clock.seasonWeeks}
      />
      <TeamMatchups rows={rows} season={season} />
      <TeamTrend rows={rows} />
      <RosterTable
        rows={roster.rows}
        weeksDone={clock.weeksDone}
        seasonWeeks={clock.seasonWeeks}
        rankingsPulledAt={roster.rankingsPulledAt}
      />
      <TeamTransactions groups={groups} stored={txns.length > 0} weeks={rows.map((r) => r.week)} />
    </>
  );
}
