import { redirect } from "next/navigation";
import { CURRENT_SEASON } from "@/lib/config";
import { displayWeek } from "@/lib/queries/runs";

export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({ searchParams }: PageProps<"/games">) {
  const sp = await searchParams;
  const week = await displayWeek(CURRENT_SEASON);
  const slate = one(sp.slate) || "main";
  const q = new URLSearchParams();
  q.set("slate", slate);
  const games = one(sp.games);
  if (games) q.set("games", games);
  redirect(`/week/${week}/games?${q.toString()}`);
}
