import type { Metadata } from "next";
import { CURRENT_SEASON } from "@/lib/config";
import { slateId } from "@/lib/queries/dfs";
import { lineupRunForWeek } from "@/lib/queries/runs";

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

/** Placeholder so NAV and breadcrumbs resolve before the browser ILP. */
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
  const sid = weekOk ? slateId(season, week, slate) : "";
  const picked = weekOk ? await lineupRunForWeek(season, week, siteKey, sid, one(sp.run)) : null;

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="t-title">Optimize</h1>
        {picked?.buildInProgress ? (
          <p className="t-caption text-warn" role="note">
            Sunday build in progress
          </p>
        ) : null}
        <p className="t-body text-muted-foreground">
          Week {n} · {site.toUpperCase()} · {slate}. Lineups generate here once the browser optimizer is
          wired.
        </p>
      </header>
    </div>
  );
}
