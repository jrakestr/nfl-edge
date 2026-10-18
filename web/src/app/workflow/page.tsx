import { WorkflowPage } from "@/components/workflow/WorkflowPage";
import { workflowUnlocked } from "@/lib/actions/workflow";
import { CURRENT_SEASON, DEFAULT_WEEK } from "@/lib/config";
import { currentWeek } from "@/lib/queries/runs";
import { latestChangeCheck, workflowRuns } from "@/lib/queries/workflow";
import { storedSlates } from "@/lib/salary-files";

export const metadata = { title: "Workflow" };
export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({ searchParams }: PageProps<"/workflow">) {
  const sp = await searchParams;
  const season = CURRENT_SEASON;
  const weekParam = Number(one(sp.week));
  const week =
    Number.isInteger(weekParam) && weekParam >= 1 ? weekParam : ((await currentWeek(season)) ?? DEFAULT_WEEK);
  const unlocked = await workflowUnlocked();
  if (!unlocked) {
    return <WorkflowPage unlocked={false} season={season} week={week} runs={[]} slates={[]} changeCheck={null} />;
  }
  const [runs, stored, changeCheck] = await Promise.all([
    workflowRuns(season, week),
    storedSlates(season, week),
    latestChangeCheck(season, week),
  ]);
  const slates = [...new Set([...stored, ...runs.filter((r) => r.phase === "dfs" && r.slate).map((r) => r.slate!)])].sort();
  return (
    <WorkflowPage unlocked season={season} week={week} runs={runs} slates={slates} changeCheck={changeCheck} />
  );
}
