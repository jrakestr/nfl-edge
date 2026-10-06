import { redirect } from "next/navigation";
import { CURRENT_SEASON } from "@/lib/config";
import { displayWeek } from "@/lib/queries/runs";
import { withPickParams } from "@/lib/slate";

export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({ searchParams }: PageProps<"/players">) {
  const week = await displayWeek(CURRENT_SEASON);
  const sp = await searchParams;
  const slate = one(sp.slate) || "main";
  const q = new URLSearchParams();
  for (const k of ["lock", "excl", "stack", "showunproj", "games"] as const) {
    const v = one(sp[k]);
    if (v) q.set(k, v);
  }
  redirect(withPickParams(`/week/${week}/players/dk/${slate}`, q));
}
