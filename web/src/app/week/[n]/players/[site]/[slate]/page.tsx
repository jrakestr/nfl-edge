import type { Metadata } from "next";
import { EmptyState } from "@/components/EmptyState";
import { PlayersList } from "@/components/players/PlayersList";
import { SlateSelector } from "@/components/shell/SlateSelector";
import { CURRENT_SEASON } from "@/lib/config";
import { slateGameInfos, slateId, slatesForWeek } from "@/lib/queries/dfs";
import { ngsByPlayer, slatePlayers } from "@/lib/queries/players";
import { stripGames } from "@/lib/queries/strip-games";
import { pickDefaultRun, runsForWeek, slateGameCount } from "@/lib/queries/runs";
import { filterGamesForSlate, missingSlateNotice, requestedSlate, resolveSlate } from "@/lib/slate";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/week/[n]/players/[site]/[slate]">): Promise<Metadata> {
  const { n, site, slate } = await params;
  return { title: `Week ${n} · Players · ${site} · ${slate}` };
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Slate player library. Unknown week still renders chrome. */
export default async function Page({
  params,
  searchParams,
}: PageProps<"/week/[n]/players/[site]/[slate]">) {
  const { n, site, slate: pathSlate } = await params;
  const sp = await searchParams;
  const week = Number(n);
  const seasonParam = Number(one(sp.season));
  const season = Number.isInteger(seasonParam) && seasonParam > 2000 ? seasonParam : CURRENT_SEASON;
  const weekOk = Number.isInteger(week) && week >= 1 && week <= 22;
  const siteKey = site === "fd" ? "fd" : "dk";
  const pinned = one(sp.run);
  const [runs, slateGames, available] = weekOk
    ? await Promise.all([
        runsForWeek(season, week),
        slateGameCount(season, week),
        slatesForWeek(season, week, siteKey),
      ])
    : [[], 0, [] as string[]];
  const requested = requestedSlate(pathSlate, one(sp.slate));
  const resolved = resolveSlate(requested, available);
  if (resolved.missing) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="t-title">Players</h1>
        {available.length ? (
          <SlateSelector week={week} site={siteKey} page="players" slate={available[0]!} slates={available} />
        ) : null}
        <EmptyState title={`${requested || "Slate"} has no salaries`}>
          {missingSlateNotice(season, weekOk ? week : 1, requested || "main")}
        </EmptyState>
      </div>
    );
  }
  const slate = resolved.slate;
  const run = pickDefaultRun(runs, slateGames, pinned);
  const sid = weekOk ? slateId(season, week, slate) : "";
  const [players, chips, infos] = await Promise.all([
    run && sid ? slatePlayers(run.run_id, siteKey, sid) : Promise.resolve([]),
    weekOk ? stripGames(season, week) : Promise.resolve([]),
    sid ? slateGameInfos(siteKey, sid) : Promise.resolve([] as string[]),
  ]);
  const strip = infos.length ? filterGamesForSlate(chips, infos) : chips;
  const ngs =
    weekOk && players.length
      ? await ngsByPlayer(
          season,
          week,
          players.map((p) => p.player_id),
        )
      : {};
  const merged = players.map((p) => ({ ...p, ngs_fpts: ngs[p.player_id] ?? null }));
  return (
    <PlayersList
      players={merged}
      slateId={sid}
      week={week}
      site={siteKey}
      slate={slate}
      strip={strip}
      fallbackFrom={players.length === 0 ? slate : null}
      toolbar={
        <SlateSelector
          key="slate"
          week={week}
          site={siteKey}
          page="players"
          slate={slate}
          slates={available}
        />
      }
    />
  );
}
