import { LineupReview } from "@/components/dfs/LineupReview";
import { CURRENT_SEASON, DEFAULT_WEEK } from "@/lib/config";
import { dfsExposure, dfsLineups, salaryTeams, slateId, stackCorrelations } from "@/lib/queries/dfs";
import { newestWeek, runsForWeek } from "@/lib/queries/runs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lineups" };

export default async function Page() {
  const week = (await newestWeek(CURRENT_SEASON)) ?? DEFAULT_WEEK;
  const runs = await runsForWeek(CURRENT_SEASON, week);
  const run = runs[0] ?? null;
  const sid = slateId(CURRENT_SEASON, week, "main");
  const [lineups, exposure, teams, correlations] = run
    ? await Promise.all([
        dfsLineups(run.run_id, "dk", sid),
        dfsExposure(run.run_id, "dk", sid),
        salaryTeams("dk", sid),
        stackCorrelations(run.run_id, "dk", sid),
      ])
    : [[], [], {}, []];
  return (
    <LineupReview
      week={String(week)}
      site="dk"
      slate="main"
      runId={run?.run_id ?? null}
      slateId={sid}
      lineups={lineups}
      exposure={exposure}
      teams={teams}
      correlations={correlations}
    />
  );
}
