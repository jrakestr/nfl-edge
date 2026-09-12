import { redirect } from "next/navigation";
import { CURRENT_SEASON, DEFAULT_WEEK } from "@/lib/config";
import { newestWeek } from "@/lib/queries/runs";
import { withPickParams } from "@/lib/slate";

export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({ searchParams }: PageProps<"/players">) {
  const week = (await newestWeek(CURRENT_SEASON)) ?? DEFAULT_WEEK;
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const k of ["lock", "excl", "stack"] as const) {
    const v = one(sp[k]);
    if (v) q.set(k, v);
  }
  redirect(withPickParams(`/week/${week}/players/dk/main`, q));
}
