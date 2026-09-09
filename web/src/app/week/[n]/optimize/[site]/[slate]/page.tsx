import type { Metadata } from "next";
import { OptimizerPage } from "@/components/optimize/OptimizerPage";
import { CURRENT_SEASON } from "@/lib/config";
import { dfsLineups, salaryLookup, salaryPositions, slateId } from "@/lib/queries/dfs";
import { slatePlayers } from "@/lib/queries/players";
import { runsForWeek } from "@/lib/queries/runs";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/week/[n]/optimize/[site]/[slate]">): Promise<Metadata> {
  const { n, site, slate } = await params;
  return { title: `Week ${n} · Optimize · ${site} · ${slate}` };
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({
  params,
  searchParams,
}: PageProps<"/week/[n]/optimize/[site]/[slate]">) {
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
  const [players, lineups, lookup] = run
    ? await Promise.all([
        slatePlayers(run.run_id, siteKey, sid),
        dfsLineups(run.run_id, siteKey, sid),
        salaryLookup(siteKey, sid),
      ])
    : [[], [], {}];
  const teams = Object.fromEntries(Object.entries(lookup).map(([k, v]) => [k, v.team]));

  return (
    <OptimizerPage
      week={n}
      site={site}
      slate={slate}
      runId={run?.run_id ?? null}
      slateId={sid}
      players={players}
      simLineups={lineups}
      teams={teams}
      positions={salaryPositions(lookup)}
    />
  );
}
