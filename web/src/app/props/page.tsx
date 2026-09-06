import { PropsIndex } from "@/components/props/PropsIndex";
import { CURRENT_SEASON, DEFAULT_WEEK } from "@/lib/config";
import { propEdges } from "@/lib/queries/props";
import { newestWeek, runsForWeek } from "@/lib/queries/runs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Props" };

export default async function Page() {
  const week = (await newestWeek(CURRENT_SEASON)) ?? DEFAULT_WEEK;
  const runs = await runsForWeek(CURRENT_SEASON, week);
  const run = runs[0] ?? null;
  const edges = run ? await propEdges(run.run_id) : [];
  return <PropsIndex edges={edges} />;
}
