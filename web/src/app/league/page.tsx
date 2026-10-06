import { LeagueHeader } from "@/components/league/LeagueHeader";
import { StandingsTable } from "@/components/league/StandingsTable";
import { parseSeason } from "@/lib/league";
import { leagueStandings } from "@/lib/queries/league";

export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: PageProps<"/league">) {
  const season = parseSeason((await searchParams).season);
  const rows = await leagueStandings(season);
  return (
    <>
      <LeagueHeader season={season} />
      <StandingsTable rows={rows} season={season} />
      <p className="t-caption">
        Actual vs projected is points scored minus ESPN&apos;s projection for those games. All-play is each
        week&apos;s score against every other team.
      </p>
    </>
  );
}
