import { redirect } from "next/navigation";
import { CURRENT_SEASON, DEFAULT_WEEK } from "@/lib/config";
import { newestWeek } from "@/lib/queries/runs";

export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({ searchParams }: PageProps<"/games">) {
  const sp = await searchParams;
  const week = (await newestWeek(CURRENT_SEASON)) ?? DEFAULT_WEEK;
  const slate = one(sp.slate) || "main";
  redirect(`/week/${week}/games?slate=${slate}`);
}
