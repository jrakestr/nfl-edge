import { direction, intensity, signed } from "@/lib/edge";
import { shortStamp } from "@/lib/format";
import { impliedFromLines, linesDiffer, simScore } from "@/lib/implied";
import { atRunLabel } from "@/lib/queries/checks";
import type { BoardRow } from "@/lib/types";
import { EdgeDiff } from "./EdgeCell";

/** Mean team points vs labeled markets. Difference is versus the current book only. */
export function GameWhy({ row, runCreatedAt }: { row: BoardRow; runCreatedAt?: string | null }) {
  const model = simScore(row);
  const now = impliedFromLines(row.total_line, row.spread_line);
  const atRun = impliedFromLines(row.run_market_total, row.run_market_spread);
  const moved = linesDiffer(row.run_market_total, row.run_market_spread, row.total_line, row.spread_line);
  const asOf = row.captured_at ? `as of ${shortStamp(row.captured_at)}` : "as of latest line";
  const runStamp = runCreatedAt ? atRunLabel(runCreatedAt) : "at run";

  return (
    <section aria-label="Why" className="flex flex-col gap-3">
      <h4 className="t-colhead text-muted-foreground">Why</h4>
      {(["away", "home"] as const).map((side) => {
        const ours = model?.[side] ?? null;
        const live = now?.[side] ?? null;
        const run = atRun?.[side] ?? null;
        const diff = ours != null && live != null ? ours - live : null;
        const dir = direction(diff);
        return (
          <div key={side} className="flex flex-col gap-1" data-side={side}>
            <p className="t-body font-semibold text-foreground">{row[side]}</p>
            <WhyRow label="Mean points" value={ours} tone="model" />
            <WhyRow label={`Market ${asOf}`} value={live} tone="market" />
            {moved ? <WhyRow label={`Market ${runStamp}`} value={run} tone="market" /> : null}
            <div className="flex items-baseline justify-between gap-3">
              <span className="t-caption text-muted-foreground">Difference vs current</span>
              {diff == null ? (
                <span className="t-caption">—</span>
              ) : (
                <EdgeDiff dir={dir} inten={intensity(diff)}>
                  {signed(diff)}
                </EdgeDiff>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function WhyRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone: "model" | "market";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="t-caption text-muted-foreground">{label}</span>
      <span className={`tnum font-semibold ${tone === "market" ? "text-line" : "text-foreground"}`}>
        {value == null ? "—" : value.toFixed(1)}
      </span>
    </div>
  );
}
