import { FairPropsIndex } from "@/components/props/FairPropsIndex";
import { CURRENT_SEASON, DEFAULT_WEEK } from "@/lib/config";
import { fairProps } from "@/lib/queries/props";
import { newestWeek, runsForWeek } from "@/lib/queries/runs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Props" };

export default async function Page() {
  const week = (await newestWeek(CURRENT_SEASON)) ?? DEFAULT_WEEK;
  const runs = await runsForWeek(CURRENT_SEASON, week);
  const run = runs[0] ?? null;
  const rows = run ? await fairProps(run.run_id) : [];
  return <FairPropsIndex rows={rows} season={CURRENT_SEASON} week={week} />;
}
