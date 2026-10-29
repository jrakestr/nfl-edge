import type { Metadata } from "next";
import { SlateReview } from "@/components/dfs/SlateReview";
import { CURRENT_SEASON } from "@/lib/config";
import { slateId } from "@/lib/queries/dfs";
import { latestGradedWeek, slateReview } from "@/lib/queries/review";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/week/[n]/dfs/[site]/[slate]/review">): Promise<Metadata> {
  const { n, site, slate } = await params;
  return { title: `Week ${n} · ${site} · ${slate} review` };
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Post-slate review. Unknown week or slate renders the empty state, never a 404. */
export default async function Page({
  params,
  searchParams,
}: PageProps<"/week/[n]/dfs/[site]/[slate]/review">) {
  const { n, slate } = await params;
  const sp = await searchParams;
  const week = Number(n);
  const seasonParam = Number(one(sp.season));
  const season = Number.isInteger(seasonParam) && seasonParam > 2000 ? seasonParam : CURRENT_SEASON;
  const siteKey = "dk";
  const weekOk = Number.isInteger(week) && week >= 1 && week <= 22;
  const contest = Number(one(sp.contest));
  const data = weekOk
    ? await slateReview({
        season,
        week,
        site: siteKey,
        slate,
        slateId: slateId(season, week, slate),
        contestKey: Number.isInteger(contest) ? contest : null,
      })
    : null;
  const latestWeek = data ? null : await latestGradedWeek(season, siteKey);
  return <SlateReview data={data} week={n} site={siteKey} slate={slate} latestWeek={latestWeek} />;
}
