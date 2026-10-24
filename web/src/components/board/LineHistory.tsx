import { displayValue, homeLine, line } from "@/lib/edge";
import { shortStamp } from "@/lib/format";
import { chartLayout } from "@/lib/game-detail";
import type { BoardRow, LineHistorySnap } from "@/lib/types";

const W = 320;
const H = 72;

function bookSpread(home: string, spread: number | null): string {
  return spread == null ? "—" : `${home} ${line(homeLine(spread))}`;
}

function SeriesChart({
  title,
  snaps,
  value,
  fair,
  format,
}: {
  title: string;
  snaps: readonly LineHistorySnap[];
  value: (snap: LineHistorySnap) => number | null;
  fair: number | null;
  format: (value: number) => string;
}) {
  const layout = chartLayout(
    snaps.map((s) => ({ id: s.id, captured_at: s.captured_at, value: value(s) })),
    fair,
    W,
    H,
  );
  const current = layout?.points[layout.points.length - 1] ?? null;
  const first = layout?.points[0] ?? null;
  if (!layout || !current || !first) return null;
  const d = layout.points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="t-caption text-muted-foreground">{title}</span>
        <span className="t-caption tnum flex items-center gap-2">
          <span className="font-semibold text-foreground">Ours {fair == null ? "—" : format(fair)}</span>
          <span className="font-semibold text-line">Book {format(current.value)}</span>
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-16 w-full"
        role="img"
        aria-label={`${title} from ${format(first.value)} to ${format(current.value)}`}
      >
        {layout.fairY != null ? (
          <line
            data-mark="model"
            x1={4}
            x2={W - 8}
            y1={layout.fairY}
            y2={layout.fairY}
            stroke="var(--foreground)"
            strokeWidth={1.5}
          />
        ) : null}
        <path data-mark="market" d={d} fill="none" stroke="var(--line)" strokeWidth={2} strokeLinejoin="round" />
        <circle data-current="" cx={current.x} cy={current.y} r={3.5} fill="var(--line)" />
      </svg>
      <div className="flex items-baseline justify-between gap-2">
        <span className="t-caption">{shortStamp(first.captured_at)} ET</span>
        <span className="t-caption">{shortStamp(current.captured_at)} ET</span>
      </div>
    </div>
  );
}

/** Market spread and total from the first snapshot through the latest, against this run's fair line. */
export function LineHistory({
  history,
  row,
}: {
  history: readonly LineHistorySnap[];
  row: Pick<BoardRow, "home" | "fair_spread" | "fair_total" | "mean_spread" | "mean_total">;
}) {
  const ourSpread = displayValue(row.mean_spread, row.fair_spread);
  const ourTotal = displayValue(row.mean_total, row.fair_total);

  return (
    <section aria-label="Fair vs market history" className="flex flex-col gap-3">
      <h3 className="t-colhead text-muted-foreground">Fair vs market history</h3>
      {history.length === 0 ? (
        <p className="t-caption">No market snapshots for this game.</p>
      ) : (
        <div className="flex flex-col gap-3">
          <SeriesChart
            title="Spread"
            snaps={history}
            value={(snap) => snap.spread_line}
            fair={ourSpread}
            format={(value) => bookSpread(row.home, value)}
          />
          <SeriesChart
            title="Total"
            snaps={history}
            value={(snap) => snap.total_line}
            fair={ourTotal}
            format={(value) => value.toFixed(1)}
          />
        </div>
      )}
    </section>
  );
}
