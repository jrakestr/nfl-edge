import { redirect } from "next/navigation";
import { CURRENT_SEASON } from "@/lib/config";
import { displayWeek } from "@/lib/queries/runs";

export const dynamic = "force-dynamic";

export default async function WeekIndex() {
  const week = await displayWeek(CURRENT_SEASON);
  redirect(`/week/${week}`);
}
