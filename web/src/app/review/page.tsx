import { redirect } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { CURRENT_SEASON } from "@/lib/config";
import { latestGradedWeek } from "@/lib/queries/review";

export const dynamic = "force-dynamic";
export const metadata = { title: "Slate review" };

/** Sidebar entry outside a week: jump to the newest graded Main slate. */
export default async function Page() {
  const week = await latestGradedWeek(CURRENT_SEASON, "dk");
  if (week != null) redirect(`/week/${week}/dfs/dk/main/review`);
  return (
    <div className="flex flex-col gap-4">
      <h1 className="t-title">Slate review</h1>
      <EmptyState title="Scores unpublished">
        No week has graded lineups yet. The review fills in after scores are published and grading runs.
      </EmptyState>
    </div>
  );
}
