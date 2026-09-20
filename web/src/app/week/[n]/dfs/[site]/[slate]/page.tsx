import type { Metadata } from "next";
import { EmptyState } from "@/components/EmptyState";
import { LineupReview } from "@/components/dfs/LineupReview";
import { SlateSelector } from "@/components/shell/SlateSelector";
import { CURRENT_SEASON } from "@/lib/config";
import {
  dfsExposure,
  dfsLineups,
  dfsSettings,
  salaryLookup,
  salaryPositions,
  slateId,
  slatesForWeek,
  stackCorrelations,
} from "@/lib/queries/dfs";
import { staleDkIds } from "@/lib/queries/players";
import { lineupRunForWeek } from "@/lib/queries/runs";
import { missingSlateNotice, requestedSlate, resolveSlate } from "@/lib/slate";

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
  const { n, site, slate: pathSlate } = await params;
  const sp = await searchParams;
  const week = Number(n);
  const seasonParam = Number(one(sp.season));
  const season = Number.isInteger(seasonParam) && seasonParam > 2000 ? seasonParam : CURRENT_SEASON;
  const siteKey = site === "fd" ? "fd" : "dk";
  const weekOk = Number.isInteger(week) && week >= 1 && week <= 22;
  const pinned = one(sp.run);
  const available = weekOk ? await slatesForWeek(season, week, siteKey) : [];
  const requested = requestedSlate(pathSlate, one(sp.slate));
  const resolved = resolveSlate(requested, available);
  if (resolved.missing) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="t-title">{`Week ${n} · ${siteKey.toUpperCase()} · ${requested}`}</h1>
        {available.length ? (
          <SlateSelector week={n} site={siteKey} page="dfs" slate={available[0]!} slates={available} />
        ) : null}
        <EmptyState title={`${requested || "Slate"} has no salaries`}>
          {missingSlateNotice(season, weekOk ? week : 1, requested || "main")}
        </EmptyState>
      </div>
    );
  }
  const slate = resolved.slate;
  const sid = weekOk ? slateId(season, week, slate) : "";
  const picked = weekOk ? await lineupRunForWeek(season, week, siteKey, sid, pinned) : null;
  const run = picked?.run ?? null;

  const [lineups, exposure, lookup, correlations, stale, settings] = run
    ? await Promise.all([
        dfsLineups(run.run_id, siteKey, sid),
        dfsExposure(run.run_id, siteKey, sid),
        salaryLookup(siteKey, sid),
        stackCorrelations(run.run_id, siteKey, sid),
        staleDkIds(season, week, run.created_at),
        dfsSettings(run.run_id, siteKey, sid),
      ])
    : [[], [], {}, [], new Set<string>(), null];
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
      staleDkIds={stale}
      buildInProgress={picked?.buildInProgress ?? false}
      slates={available}
      fallbackFrom={lineups.length === 0 ? slate : null}
      settings={settings}
    />
  );
}
