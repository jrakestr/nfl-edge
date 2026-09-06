import type { Metadata } from "next";
import { LineupReview } from "@/components/dfs/LineupReview";
import { CURRENT_SEASON } from "@/lib/config";
import { dfsExposure, dfsLineups, salaryTeams, slateId, stackCorrelations } from "@/lib/queries/dfs";
import { runsForWeek } from "@/lib/queries/runs";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/week/[n]/dfs/[site]/[slate]">): Promise<Metadata> {
  const { n, site, slate } = await params;
  return { title: `Week ${n} · ${site} · ${slate}` };
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Unknown week/site/slate still render chrome — never 404. */
export default async function Page({
  params,
  searchParams,
}: PageProps<"/week/[n]/dfs/[site]/[slate]">) {
  const { n, site, slate } = await params;
  const sp = await searchParams;
  const week = Number(n);
  const seasonParam = Number(one(sp.season));
  const season = Number.isInteger(seasonParam) && seasonParam > 2000 ? seasonParam : CURRENT_SEASON;
  const siteKey = site === "fd" ? "fd" : "dk";
  const weekOk = Number.isInteger(week) && week >= 1 && week <= 22;

  const runs = weekOk ? await runsForWeek(season, week) : [];
  const pinned = one(sp.run);
  const run = runs.length ? (pinned ? (runs.find((r) => r.run_id === pinned) ?? runs[0]) : runs[0]) : null;
  const sid = weekOk ? slateId(season, week, slate) : "";

  const [lineups, exposure, teams, correlations] = run
    ? await Promise.all([
        dfsLineups(run.run_id, siteKey, sid),
        dfsExposure(run.run_id, siteKey, sid),
        salaryTeams(siteKey, sid),
        stackCorrelations(run.run_id, siteKey, sid),
      ])
    : [[], [], {}, []];

  return (
    <LineupReview
      week={n}
      site={site}
      slate={slate}
      runId={run?.run_id ?? null}
      slateId={sid}
      lineups={lineups}
      exposure={exposure}
      teams={teams}
      correlations={correlations}
    />
  );
}
