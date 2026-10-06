import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { LeagueHeader } from "@/components/league/LeagueHeader";
import { MatchupCard } from "@/components/league/MatchupCard";
import { RankedWeekTable } from "@/components/league/RankedWeekTable";
import { StarterMisses } from "@/components/league/StarterMisses";
import { leagueHref, parseSeason, weekMatchups } from "@/lib/league";
import {
  leaguePlayerChecks,
  leagueStarters,
  leagueTeamWeeks,
  leagueWeekStates,
} from "@/lib/queries/league";

export const dynamic = "force-dynamic";

export default async function Page({ params, searchParams }: PageProps<"/league/week/[n]">) {
  const season = parseSeason((await searchParams).season);
  const n = Number((await params).n);
  const weeks = await leagueWeekStates(season);
  const state = weeks.find((w) => w.week === n);
  if (!Number.isInteger(n) || !state) {
    return (
      <>
        <LeagueHeader season={season} />
        <EmptyState title={`No league data for week ${Number.isInteger(n) ? n : "that"}`}>
          {weeks.length > 0
            ? `Weeks stored: ${weeks.map((w) => w.week).join(", ")}.`
            : "Run nfl-edge ingest espn-league to load the league."}
        </EmptyState>
      </>
    );
  }
  const [rows, starters, checks] = await Promise.all([
    leagueTeamWeeks(season, { week: n }),
    leagueStarters(season, n),
    leaguePlayerChecks(season, n),
  ]);
  const prev = weeks.find((w) => w.week === n - 1);
  const next = weeks.find((w) => w.week === n + 1);
  const matchups = weekMatchups(rows);
  return (
    <>
      <LeagueHeader season={season} title={`Week ${n}`} />
      <nav aria-label="Week" className="flex items-center gap-4 t-body">
        {prev ? (
          <Link href={leagueHref(`/league/week/${prev.week}`, season)} className="text-muted-foreground hover:text-foreground">
            ← Week {prev.week}
          </Link>
        ) : null}
        <span className="font-semibold">{state.is_final ? `Week ${n} final` : `Week ${n} in progress`}</span>
        {next ? (
          <Link href={leagueHref(`/league/week/${next.week}`, season)} className="text-muted-foreground hover:text-foreground">
            Week {next.week} →
          </Link>
        ) : null}
      </nav>
      <section className="flex flex-col gap-2" aria-label="Matchups">
        <h2 className="t-body font-semibold">Matchups</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {matchups.map(({ a, b }) => (
            <MatchupCard key={a.espn_team_id} a={a} b={b} season={season} />
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-2" aria-label="Ranked scores">
        <h2 className="t-body font-semibold">Ranked by score</h2>
        <RankedWeekTable rows={rows} season={season} />
      </section>
      <section className="flex flex-col gap-2" aria-label="Starter misses">
        <h2 className="t-body font-semibold">Starter misses</h2>
        <StarterMisses starters={starters} checks={checks} weekFinal={state.is_final} season={season} />
      </section>
    </>
  );
}
