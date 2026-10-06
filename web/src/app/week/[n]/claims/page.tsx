import type { Metadata } from "next";
import { ClaimsPanel } from "@/components/claims/ClaimsPanel";
import { CURRENT_SEASON } from "@/lib/config";
import { claimsForWeek } from "@/lib/queries/claims";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/week/[n]/claims">): Promise<Metadata> {
  const { n } = await params;
  return { title: `Week ${n} · Claims` };
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({
  params,
  searchParams,
}: PageProps<"/week/[n]/claims">) {
  const { n } = await params;
  const sp = await searchParams;
  const week = Number(n);
  const seasonParam = Number(one(sp.season));
  const season = Number.isInteger(seasonParam) && seasonParam > 2000 ? seasonParam : CURRENT_SEASON;
  const rows = Number.isInteger(week) ? await claimsForWeek(season, week) : [];
  return (
    <div className="flex flex-col gap-4">
      <h1 className="t-title">Claims</h1>
      <p className="t-caption">
        Staged only. Promote writes one row to player overrides. Do not promote at the Phase 2 checkpoint.
      </p>
      <ClaimsPanel season={season} week={Number.isInteger(week) ? week : 1} rows={rows} />
    </div>
  );
}
