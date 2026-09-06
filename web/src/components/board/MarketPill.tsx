import { line, price } from "@/lib/edge";
import { cn } from "@/lib/utils";

/**
 * Market line as a compact chip, always --line: `SEA −3.5 (−110)` or `O/U 44.5`.
 * `spreadLine` is nflverse convention (positive = home favored). Click is a tooltip-only
 * no-op until snapshots accumulate for a movement sparkline (web-refine).
 */
export function MarketPill({
  home,
  away,
  spreadLine,
  homeSpreadOdds,
  awaySpreadOdds,
  className,
}: {
  home: string;
  away: string;
  spreadLine: number | null | undefined;
  homeSpreadOdds?: number | null;
  awaySpreadOdds?: number | null;
  className?: string;
}) {
  if (spreadLine == null) {
    return <Pill className={className}>No line</Pill>;
  }
  const homeFav = spreadLine > 0;
  const team = spreadLine === 0 ? home : homeFav ? home : away;
  const odds = homeFav ? homeSpreadOdds : awaySpreadOdds;
  const text = spreadLine === 0 ? `${team} PK` : `${team} ${line(-Math.abs(spreadLine))}`;
  return (
    <Pill className={className} title="One snapshot so far; line movement arrives as snapshots accumulate">
      {text}
      {odds != null ? <span className="opacity-80">({price(odds)})</span> : null}
    </Pill>
  );
}

export function TotalPill({ totalLine, className }: { totalLine: number | null | undefined; className?: string }) {
  if (totalLine == null) return null;
  return <Pill className={className}>O/U {totalLine.toFixed(1)}</Pill>;
}

export function Pill({
  children,
  className,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "tnum inline-flex h-6 items-center gap-1 rounded-sm bg-line-tint px-2 text-[12px] font-semibold text-line whitespace-nowrap",
        className,
      )}
      data-market
    >
      {children}
    </span>
  );
}
