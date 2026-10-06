import { GradingPage } from "@/components/grading/GradingPage";
import { CURRENT_SEASON } from "@/lib/config";
import { compareWithSite } from "@/lib/ngs-compare";
import { ngsGames } from "@/lib/queries/ngs-compare";
import { playerBias } from "@/lib/queries/player-bias";
import {
  calibrationBuckets,
  finalGamesByWeek,
  gradedGames,
  trackRecord,
  weeklyPicks,
} from "@/lib/queries/results";

export const metadata = { title: "Grading" };
export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({ searchParams }: PageProps<"/grading">) {
  const sp = await searchParams;
  const seasonParam = Number(one(sp.season));
  const season = Number.isInteger(seasonParam) && seasonParam > 2000 ? seasonParam : CURRENT_SEASON;
  const weekRaw = Number(one(sp.week));
  const weekFilter = Number.isInteger(weekRaw) && weekRaw >= 1 ? weekRaw : null;
  const cal = one(sp.cal) ?? null;
  const marketFilter = cal === "spread" || cal === "total" || cal === "moneyline" ? cal : null;

  const [track, games, buckets, weekly, finals, siteGames, bias] = await Promise.all([
    trackRecord(season, weekFilter),
    gradedGames(season),
    calibrationBuckets(season, marketFilter),
    weeklyPicks(season),
    finalGamesByWeek(season),
    ngsGames(season),
    playerBias(season),
  ]);
  const weeks = [...new Set(games.map((g) => g.week))].sort((a, b) => a - b);

  return (
    <GradingPage
      track={track}
      games={games}
      buckets={buckets}
      weeks={weeks}
      weekly={weekly}
      finalByWeek={finals}
      ngs={compareWithSite(games, siteGames, weekFilter)}
      playerBias={bias}
      weekFilter={weekFilter}
      marketFilter={marketFilter}
      season={season}
    />
  );
}
