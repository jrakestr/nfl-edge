import { AcquireTable } from "@/components/league/AcquireTable";
import { LeagueHeader } from "@/components/league/LeagueHeader";
import { parseSeason } from "@/lib/league";
import { leagueAcquire, leagueClock } from "@/lib/queries/league";

export const metadata = { title: "LOC acquire" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: PageProps<"/league/acquire">) {
  const season = parseSeason((await searchParams).season);
  const [rows, clock] = await Promise.all([leagueAcquire(season), leagueClock(season)]);
  return (
    <>
      <LeagueHeader season={season} title="Acquire" />
      <AcquireTable rows={rows} season={season} seasonWeeks={clock.seasonWeeks} />
    </>
  );
}
