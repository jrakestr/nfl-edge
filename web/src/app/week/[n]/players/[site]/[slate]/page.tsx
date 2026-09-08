import type { Metadata } from "next";
import { PlayersList } from "@/components/players/PlayersList";
import { CURRENT_SEASON } from "@/lib/config";
import { weekPlayers } from "@/lib/queries/players";
import { runsForWeek } from "@/lib/queries/runs";

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

/** Week-wide projections until the slate library lands. Unknown week still renders chrome. */
export default async function Page({
  params,
  searchParams,
}: PageProps<"/week/[n]/players/[site]/[slate]">) {
  const { n } = await params;
  const sp = await searchParams;
  const week = Number(n);
  const seasonParam = Number(one(sp.season));
  const season = Number.isInteger(seasonParam) && seasonParam > 2000 ? seasonParam : CURRENT_SEASON;
  const weekOk = Number.isInteger(week) && week >= 1 && week <= 22;
  const runs = weekOk ? await runsForWeek(season, week) : [];
  const pinned = one(sp.run);
  const run = runs.length ? (pinned ? (runs.find((r) => r.run_id === pinned) ?? runs[0]) : runs[0]) : null;
  const players = run ? await weekPlayers(run.run_id) : [];
  return <PlayersList players={players} />;
}
