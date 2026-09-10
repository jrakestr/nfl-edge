import { redirect } from "next/navigation";
import { DEFAULT_WEEK } from "@/lib/config";

/** Same as `/`: no DB. The week page is the only pooler hit for the board. */
export default function WeekIndex() {
  redirect(`/week/${DEFAULT_WEEK}`);
}
