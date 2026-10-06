import { LeagueHeader } from "@/components/league/LeagueHeader";
import { WireBoard } from "@/components/league/WireBoard";
import { parseSeason } from "@/lib/league";
import { leagueWire } from "@/lib/queries/league";

export const metadata = { title: "LOC waiver wire" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: PageProps<"/league/wire">) {
  const season = parseSeason((await searchParams).season);
  const bundle = await leagueWire(season);
  return (
    <>
      <LeagueHeader season={season} title="Waiver wire" />
      <WireBoard bundle={bundle} />
    </>
  );
}
