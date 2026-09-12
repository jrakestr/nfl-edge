import type { Metadata } from "next";
import { LineupReview } from "@/components/dfs/LineupReview";
import { CURRENT_SEASON } from "@/lib/config";
import { dfsExposure, dfsLineups, salaryLookup, salaryPositions, slateId, stackCorrelations } from "@/lib/queries/dfs";
import { pickDefaultRun, runsForWeek, slateGameCount } from "@/lib/queries/runs";

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

  const pinned = one(sp.run);
  const [runs, slateGames] = weekOk
    ? await Promise.all([runsForWeek(season, week), slateGameCount(season, week)])
    : [[], 0];
  const run = pickDefaultRun(runs, slateGames, pinned);
  const sid = weekOk ? slateId(season, week, slate) : "";

  const [lineups, exposure, lookup, correlations] = run
    ? await Promise.all([
        dfsLineups(run.run_id, siteKey, sid),
        dfsExposure(run.run_id, siteKey, sid),
        salaryLookup(siteKey, sid),
        stackCorrelations(run.run_id, siteKey, sid),
      ])
    : [[], [], {}, []];
  const teams = Object.fromEntries(Object.entries(lookup).map(([k, v]) => [k, v.team]));

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
      positions={salaryPositions(lookup)}
      correlations={correlations}
    />
  );
}
