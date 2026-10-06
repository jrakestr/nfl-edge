import { EdgeDiff } from "@/components/board/EdgeCell";
import { paceGap, pointsRemaining, pointsTone, seasonShare, weeksLeft } from "@/lib/league";
import { cn } from "@/lib/utils";

function remainText(remain: number): string {
  if (remain >= 0) return `${remain.toFixed(1)} still to score`;
  return `${Math.abs(remain).toFixed(1)} over the projection`;
}

/**
 * Season points as a percent of ESPN's season projection. The percent is colored by pace
 * (points versus projection × weeks done / season length). Weeks left and points remaining
 * sit on the cell so the color has a reason. No projection, or no completed week, stays uncolored.
 */
export function PaceFigure({
  pts,
  proj,
  weeksDone,
  seasonWeeks,
  align = "end",
}: {
  pts: number | null;
  proj: number | null;
  weeksDone: number;
  seasonWeeks: number;
  align?: "end" | "start";
}) {
  const pct = seasonShare(pts, proj);
  const gap = paceGap(pts, proj, weeksDone, seasonWeeks);
  const left = weeksLeft(weeksDone, seasonWeeks);
  const remain = pointsRemaining(pts, proj);
  const text = pct == null ? "—" : `${Math.round(pct)}%`;
  const tone = gap == null ? null : pointsTone(gap);
  const detail = remain != null && left != null ? `${left} ${left === 1 ? "week" : "weeks"} left, ${remainText(remain)}` : null;
  return (
    <span className={cn("inline-flex flex-col", align === "end" ? "items-end" : "items-start")}>
      {tone ? (
        <EdgeDiff dir={tone.dir} inten={tone.inten}>{text}</EdgeDiff>
      ) : (
        <span className="tnum">{text}</span>
      )}
      {detail ? <span className="t-caption font-normal text-muted-foreground">{detail}</span> : null}
    </span>
  );
}
