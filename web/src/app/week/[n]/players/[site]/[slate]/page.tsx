import type { Metadata } from "next";
import { PlayersList } from "@/components/players/PlayersList";
import { SlateSelector } from "@/components/shell/SlateSelector";
import { CURRENT_SEASON } from "@/lib/config";
import { slateId, slatesForWeek } from "@/lib/queries/dfs";
import { slatePlayers } from "@/lib/queries/players";
import { pickDefaultRun, runsForWeek, slateGameCount } from "@/lib/queries/runs";
import { requestedSlate, resolveSlate } from "@/lib/slate";

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
  const fallbackFrom = resolved.fallback && requested !== "main" ? requested : null;
  const slate = resolved.slate;
  const run = pickDefaultRun(runs, slateGames, pinned);
  const sid = weekOk ? slateId(season, week, slate) : "";
  const players = run && sid ? await slatePlayers(run.run_id, siteKey, sid) : [];
  return (
    <PlayersList
      players={players}
      slateId={sid}
      week={week}
      site={siteKey}
      slate={slate}
      fallbackFrom={fallbackFrom}
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
