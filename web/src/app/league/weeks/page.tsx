import { LeagueHeader } from "@/components/league/LeagueHeader";
import { LuckTable } from "@/components/league/LuckTable";
import { PaRunningTable } from "@/components/league/PaRunningTable";
import { WeekGrid } from "@/components/league/WeekGrid";
import { parseSeason } from "@/lib/league";
import { leagueLuck, leagueTeamWeeks, leagueWeekStates } from "@/lib/queries/league";

export const metadata = { title: "LOC season" };
export const dynamic = "force-dynamic";

export default async function Page({ searchParams }: PageProps<"/league/weeks">) {
  const season = parseSeason((await searchParams).season);
  const [rows, luck, weeks] = await Promise.all([
    leagueTeamWeeks(season),
    leagueLuck(season),
    leagueWeekStates(season),
  ]);
  const finalWeeks = weeks.filter((w) => w.is_final).length;
  return (
    <>
      <LeagueHeader season={season} title="Season" />
      <p className="t-sentence">
        Each cell is points scored minus ESPN&apos;s projection for that team and week. A week still in
        progress shows an em dash.
      </p>
      <WeekGrid rows={rows} season={season} />
      <PaRunningTable rows={rows} season={season} />
      <section className="flex flex-col gap-2" aria-label="Luck">
        <h2 className="t-body font-semibold">Luck</h2>
        <LuckTable rows={luck.rows} fit={luck.fit} finalWeeks={finalWeeks} season={season} />
      </section>
    </>
  );
}
