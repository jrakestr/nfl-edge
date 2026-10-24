import { homeLine, line } from "@/lib/edge";
import { markerPercent, trimIntHist, type TrimmedHist } from "@/lib/game-detail";
import type { LineGrid } from "@/lib/line-grid";
import type { BoardRow } from "@/lib/types";

function HistRow({
  label,
  trimmed,
  modelValue,
  marketValue,
  modelCaption,
  marketCaption,
}: {
  label: string;
  trimmed: TrimmedHist;
  modelValue: number | null;
  marketValue: number | null;
  modelCaption: string;
  marketCaption: string;
}) {
  const modelPct = markerPercent(modelValue, trimmed.lo, trimmed.hi);
  const marketPct = markerPercent(marketValue, trimmed.lo, trimmed.hi);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="t-caption text-muted-foreground">{label}</span>
        <span className="t-caption tnum flex items-center gap-2">
          <span className="font-semibold text-foreground">{modelCaption}</span>
          <span className="font-semibold text-line">{marketCaption}</span>
        </span>
      </div>
      <div
        className="relative flex h-10 w-full items-end gap-px overflow-hidden rounded-sm bg-muted px-0.5"
        role="img"
        aria-label={`${label} distribution across ${trimmed.draws.toLocaleString("en-US")} draws`}
      >
        {trimmed.counts.map((c, i) => {
          const bin = trimmed.lo + i;
          return (
            <span
              key={bin}
              data-hist-bar=""
              data-bin={bin}
              className="min-w-0 flex-1 rounded-sm bg-foreground/40"
              style={{ height: c > 0 ? `${Math.max(8, (c / trimmed.max) * 100)}%` : "0%" }}
            />
          );
        })}
        {modelPct != null ? (
          <span
            aria-hidden
            data-mark="model"
            className="absolute inset-y-0 w-px bg-foreground"
            style={{ left: `${modelPct}%` }}
          />
        ) : null}
        {marketPct != null ? (
          <span
            aria-hidden
            data-mark="market"
            className="absolute inset-y-0 w-px bg-line"
            style={{ left: `${marketPct}%` }}
          />
        ) : null}
      </div>
    </div>
  );
}

/** Margin and total distributions from model.proj_games.line_grid with model and market markers. */
export function ScoreDistribution({
  grid,
  row,
}: {
  grid: LineGrid | null | undefined;
  row: Pick<BoardRow, "home" | "fair_spread" | "fair_total" | "spread_line" | "total_line">;
}) {
  const margin = trimIntHist(grid?.margin);
  const total = trimIntHist(grid?.total);
  return (
    <section aria-label="Score distribution" className="flex flex-col gap-2">
      <h3 className="t-colhead text-muted-foreground">Score distribution</h3>
      {!margin && !total ? (
        <p className="t-caption">No distribution on this run.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {margin ? (
            <HistRow
              label={`${row.home} margin`}
              trimmed={margin}
              modelValue={row.fair_spread}
              marketValue={row.spread_line}
              modelCaption={
                row.fair_spread != null ? `Ours ${row.home} ${line(homeLine(row.fair_spread))}` : "Ours —"
              }
              marketCaption={
                row.spread_line != null ? `Book ${row.home} ${line(homeLine(row.spread_line))}` : "Book —"
              }
            />
          ) : null}
          {total ? (
            <HistRow
              label="Total points"
              trimmed={total}
              modelValue={row.fair_total}
              marketValue={row.total_line}
              modelCaption={row.fair_total != null ? `Ours ${row.fair_total.toFixed(1)}` : "Ours —"}
              marketCaption={row.total_line != null ? `Book ${row.total_line.toFixed(1)}` : "Book —"}
            />
          ) : null}
        </div>
      )}
    </section>
  );
}
