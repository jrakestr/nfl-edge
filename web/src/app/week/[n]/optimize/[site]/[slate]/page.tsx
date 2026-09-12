import type { Metadata } from "next";
import { Optimizer } from "@/components/optimize/Optimizer";
import { CURRENT_SEASON } from "@/lib/config";
import { dfsLineups, salaryLookup, salaryPositions, slateId, slatesForWeek } from "@/lib/queries/dfs";
import { slatePlayers } from "@/lib/queries/players";
import { lineupRunForWeek } from "@/lib/queries/runs";
import { requestedSlate, resolveSlate } from "@/lib/slate";

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
  const { n, site, slate: pathSlate } = await params;
  const sp = await searchParams;
  const week = Number(n);
  const seasonParam = Number(one(sp.season));
  const season = Number.isInteger(seasonParam) && seasonParam > 2000 ? seasonParam : CURRENT_SEASON;
  const siteKey = site === "fd" ? "fd" : "dk";
  const weekOk = Number.isInteger(week) && week >= 1 && week <= 22;
  const available = weekOk ? await slatesForWeek(season, week, siteKey) : [];
  const requested = requestedSlate(pathSlate, one(sp.slate));
  const resolved = resolveSlate(requested, available);
  const fallbackFrom = resolved.fallback && requested !== "main" ? requested : null;
  const slate = resolved.slate;
  const sid = weekOk ? slateId(season, week, slate) : "";
  const picked = weekOk ? await lineupRunForWeek(season, week, siteKey, sid, one(sp.run)) : null;
  const run = picked?.run ?? null;

  const [players, simLineups, lookup] = run
    ? await Promise.all([
        slatePlayers(run.run_id, siteKey, sid),
        dfsLineups(run.run_id, siteKey, sid),
        salaryLookup(siteKey, sid),
      ])
    : [[], [], {} as Awaited<ReturnType<typeof salaryLookup>>];
  const teams = Object.fromEntries(Object.entries(lookup).map(([k, v]) => [k, v.team]));

  return (
    <Optimizer
      week={n}
      site={siteKey}
      slate={slate}
      slates={available}
      slateId={sid}
      runId={run?.run_id ?? null}
      players={players}
      simLineups={simLineups}
      teams={teams}
      positions={salaryPositions(lookup)}
      fallbackFrom={fallbackFrom}
      buildInProgress={picked?.buildInProgress ?? false}
    />
  );
}
