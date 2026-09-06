import { redirect } from "next/navigation";
import { DEFAULT_WEEK } from "@/lib/config";

export default function WeekIndex() {
  redirect(`/week/${DEFAULT_WEEK}`);
}
