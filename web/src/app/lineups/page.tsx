import { LineupReview } from "@/components/dfs/LineupReview";
import { CURRENT_SEASON, DEFAULT_WEEK } from "@/lib/config";
import { dfsExposure, dfsLineups, salaryLookup, salaryPositions, slateId, stackCorrelations } from "@/lib/queries/dfs";
import { staleDkIds } from "@/lib/queries/players";
import { lineupRunForWeek, newestWeek } from "@/lib/queries/runs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lineups" };

export default async function Page() {
  const week = (await newestWeek(CURRENT_SEASON)) ?? DEFAULT_WEEK;
  const sid = slateId(CURRENT_SEASON, week, "main");
  const picked = await lineupRunForWeek(CURRENT_SEASON, week, "dk", sid);
  const run = picked?.run ?? null;
  const [lineups, exposure, lookup, correlations, stale] = run
    ? await Promise.all([
        dfsLineups(run.run_id, "dk", sid),
        dfsExposure(run.run_id, "dk", sid),
        salaryLookup("dk", sid),
        stackCorrelations(run.run_id, "dk", sid),
        staleDkIds(CURRENT_SEASON, week, run.created_at),
      ])
    : [[], [], {}, [], new Set<string>()];
  const teams = Object.fromEntries(Object.entries(lookup).map(([k, v]) => [k, v.team]));
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
      positions={salaryPositions(lookup)}
      correlations={correlations}
      staleDkIds={stale}
      buildInProgress={picked?.buildInProgress ?? false}
    />
  );
}
