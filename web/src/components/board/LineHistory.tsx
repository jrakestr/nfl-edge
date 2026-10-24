import { atRunLabel } from "@/lib/check-display";
import { direction, displayValue, homeLine, intensity, line, signed } from "@/lib/edge";
import { shortStamp } from "@/lib/format";
import { nearestRunSnapId } from "@/lib/game-detail";
import type { BoardRow, LineHistorySnap } from "@/lib/types";
import { EdgeDiff } from "./EdgeCell";

function pointEdge(gap: number): number {
  const a = Math.abs(gap);
  if (a < 0.5) return 0;
  const mag = a >= 1.5 ? 0.03 : 0.015;
  return gap > 0 ? mag : -mag;
}

/** Market spread and total snapshots over time on the reference book vs this run's fair line. */
export function LineHistory({
  history,
  row,
  runCreatedAt,
}: {
  history: readonly LineHistorySnap[];
  row: Pick<BoardRow, "home" | "fair_spread" | "fair_total" | "mean_spread" | "mean_total">;
  runCreatedAt?: string | null;
}) {
  const ourSpread = displayValue(row.mean_spread, row.fair_spread);
  const ourTotal = displayValue(row.mean_total, row.fair_total);
  const runSnapId = nearestRunSnapId(history, runCreatedAt);

  return (
    <section aria-label="Fair vs market history" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="t-colhead text-muted-foreground">Fair vs market history</h3>
        <span className="t-caption tnum font-semibold text-foreground">
          Ours {ourSpread != null ? `${row.home} ${line(homeLine(ourSpread))}` : "—"}{" "}
          {ourTotal != null ? ourTotal.toFixed(1) : "—"}
        </span>
      </div>
      {history.length === 0 ? (
        <p className="t-caption">No market snapshots for this game.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {history.map((s) => {
            const spreadGap =
              ourSpread != null && s.spread_line != null ? ourSpread - s.spread_line : null;
            const totalGap =
              ourTotal != null && s.total_line != null ? ourTotal - s.total_line : null;
            const isRunSnap = runSnapId != null && s.id === runSnapId && runCreatedAt != null;
            return (
              <li
                key={s.id}
                data-snap-id={s.id}
                className="flex items-center justify-between gap-2"
              >
                <span className="t-caption">
                  {shortStamp(s.captured_at)} ET
                  {isRunSnap ? ` · ${atRunLabel(runCreatedAt)}` : ""}
                </span>
                <span className="t-body tnum flex items-center gap-2">
                  <span className="font-semibold text-line">
                    {s.spread_line != null ? `${row.home} ${line(homeLine(s.spread_line))}` : "—"}
                  </span>
                  {spreadGap != null ? (
                    <EdgeDiff
                      dir={direction(pointEdge(spreadGap))}
                      inten={intensity(pointEdge(spreadGap))}
                    >
                      {signed(spreadGap, 1)}
                    </EdgeDiff>
                  ) : null}
                  <span className="font-semibold text-line">
                    {s.total_line != null ? s.total_line.toFixed(1) : "—"}
                  </span>
                  {totalGap != null ? (
                    <EdgeDiff
                      dir={direction(pointEdge(totalGap))}
                      inten={intensity(pointEdge(totalGap))}
                    >
                      {signed(totalGap, 1)}
                    </EdgeDiff>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
