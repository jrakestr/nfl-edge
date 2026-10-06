import { redirect } from "next/navigation";
import { leagueHref, parseSeason } from "@/lib/league";

export const dynamic = "force-dynamic";

/** Luck lives on Season. Old links land there. */
export default async function Page({ searchParams }: PageProps<"/league/luck">) {
  const season = parseSeason((await searchParams).season);
  redirect(leagueHref("/league/weeks", season));
}
