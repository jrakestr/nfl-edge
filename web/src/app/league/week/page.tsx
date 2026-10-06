import { redirect } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { LeagueHeader } from "@/components/league/LeagueHeader";
import { leagueHref, parseSeason } from "@/lib/league";
import { leagueWeekStates } from "@/lib/queries/league";

export const dynamic = "force-dynamic";

/** The week in play: the lowest open week, else the newest final one. */
export default async function Page({ searchParams }: PageProps<"/league/week">) {
  const season = parseSeason((await searchParams).season);
  const weeks = await leagueWeekStates(season);
  if (weeks.length === 0) {
    return (
      <>
        <LeagueHeader season={season} />
        <EmptyState title="No league weeks yet">Run nfl-edge ingest espn-league to load them.</EmptyState>
      </>
    );
  }
  const open = weeks.filter((w) => !w.is_final).map((w) => w.week);
  const week = open.length > 0 ? Math.min(...open) : Math.max(...weeks.map((w) => w.week));
  redirect(leagueHref(`/league/week/${week}`, season));
}
