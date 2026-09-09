import type { Metadata } from "next";
import { PlayersList } from "@/components/players/PlayersList";
import { CURRENT_SEASON } from "@/lib/config";
import { slateId } from "@/lib/queries/dfs";
import { slatePlayers } from "@/lib/queries/players";
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

/** Slate library: salaries + this run's projections. Lock / exclude / stack write the URL. */
export default async function Page({
  params,
  searchParams,
}: PageProps<"/week/[n]/players/[site]/[slate]">) {
  const { n, site, slate } = await params;
  const sp = await searchParams;
  const week = Number(n);
  const seasonParam = Number(one(sp.season));
  const season = Number.isInteger(seasonParam) && seasonParam > 2000 ? seasonParam : CURRENT_SEASON;
  const weekOk = Number.isInteger(week) && week >= 1 && week <= 22;
  const siteKey = site === "fd" ? "fd" : "dk";
  const runs = weekOk ? await runsForWeek(season, week) : [];
  const pinned = one(sp.run);
  const run = runs.length ? (pinned ? (runs.find((r) => r.run_id === pinned) ?? runs[0]) : runs[0]) : null;
  const sid = weekOk ? slateId(season, week, slate) : "";
  const players = run && sid ? await slatePlayers(run.run_id, siteKey, sid) : [];
  return <PlayersList week={n} site={site} slate={slate} players={players} />;
}
