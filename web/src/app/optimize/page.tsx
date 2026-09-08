import { redirect } from "next/navigation";
import { CURRENT_SEASON, DEFAULT_WEEK } from "@/lib/config";
import { newestWeek } from "@/lib/queries/runs";

export const dynamic = "force-dynamic";

export default async function Page() {
  const week = (await newestWeek(CURRENT_SEASON)) ?? DEFAULT_WEEK;
  redirect(`/week/${week}/optimize/dk/main`);
}
