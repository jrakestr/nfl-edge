import type { Metadata } from "next";
import { EmptyState } from "@/components/EmptyState";
import { Optimizer } from "@/components/optimize/Optimizer";
import { SlateSelector } from "@/components/shell/SlateSelector";
import { CURRENT_SEASON } from "@/lib/config";
import { dfsLineups, salaryLookup, salaryPositions, slateCorrelations, slateGameInfos, slateId, slatesForWeek } from "@/lib/queries/dfs";
import { slatePlayers } from "@/lib/queries/players";
import { stripGames } from "@/lib/queries/strip-games";
import { slateCorrIds } from "@/lib/optimize/stack-suggestions";
import { lineupRunForWeek } from "@/lib/queries/runs";
import { filterGamesForSlate, missingSlateNotice, requestedSlate, resolveSlate } from "@/lib/slate";

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
  if (resolved.missing) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="t-title">Optimize</h1>
        {available.length ? (
          <SlateSelector week={n} site={siteKey} page="optimize" slate={available[0]!} slates={available} />
        ) : null}
        <EmptyState title={`${requested || "Slate"} has no salaries`}>
          {missingSlateNotice(season, weekOk ? week : 1, requested || "main")}
        </EmptyState>
      </div>
    );
  }
  const slate = resolved.slate;
  const sid = weekOk ? slateId(season, week, slate) : "";
  const picked = weekOk ? await lineupRunForWeek(season, week, siteKey, sid, one(sp.run)) : null;
  const run = picked?.run ?? null;

  const [players, simLineups, lookup, chips, infos] = await Promise.all([
    run ? slatePlayers(run.run_id, siteKey, sid) : Promise.resolve([]),
    run ? dfsLineups(run.run_id, siteKey, sid) : Promise.resolve([]),
    run ? salaryLookup(siteKey, sid) : Promise.resolve({} as Awaited<ReturnType<typeof salaryLookup>>),
    weekOk ? stripGames(season, week) : Promise.resolve([]),
    sid ? slateGameInfos(siteKey, sid) : Promise.resolve([] as string[]),
  ]);
  const pairs = run ? await slateCorrelations(run.run_id, slateCorrIds(players)) : [];
  const teams = Object.fromEntries(Object.entries(lookup).map(([k, v]) => [k, v.team]));
  const strip = infos.length ? filterGamesForSlate(chips, infos) : chips;

  return (
    <Optimizer
      week={n}
      site={siteKey}
      slate={slate}
      slates={available}
      slateId={sid}
      runId={run?.run_id ?? null}
      players={players}
      pairs={pairs}
      simLineups={simLineups}
      teams={teams}
      positions={salaryPositions(lookup)}
      fallbackFrom={players.length === 0 ? slate : null}
      buildInProgress={picked?.buildInProgress ?? false}
      strip={strip}
    />
  );
}
