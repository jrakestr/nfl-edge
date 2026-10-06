import { FairPropsIndex } from "@/components/props/FairPropsIndex";
import { CURRENT_SEASON } from "@/lib/config";
import { fairProps } from "@/lib/queries/props";
import { displayWeek, runForWeek } from "@/lib/queries/runs";
import { stripGames } from "@/lib/queries/strip-games";

export const dynamic = "force-dynamic";
export const metadata = { title: "Props" };

export default async function Page() {
  const week = await displayWeek(CURRENT_SEASON);
  const run = await runForWeek(CURRENT_SEASON, week);
  const [rows, strip] = await Promise.all([
    run ? fairProps(run.run_id) : Promise.resolve([]),
    stripGames(CURRENT_SEASON, week),
  ]);
  return (
    <FairPropsIndex
      rows={rows}
      season={CURRENT_SEASON}
      week={week}
      drawsPruned={Boolean(run?.draws_pruned)}
      strip={strip}
    />
  );
}
