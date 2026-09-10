import { redirect } from "next/navigation";
import { DEFAULT_WEEK } from "@/lib/config";

/** Static redirect: do not touch Postgres here. `/` was 500ing the session pooler. */
export default function Home() {
  redirect(`/week/${DEFAULT_WEEK}`);
}
