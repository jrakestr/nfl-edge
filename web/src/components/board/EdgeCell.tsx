import { direction, intensity, line, pct, signed, signedPct, type Direction, type Intensity } from "@/lib/edge";
import { cn } from "@/lib/utils";

export type EdgeKind = "spread" | "total" | "prob" | "pct";

/**
 * The atom of the edge board: model · market · difference.
 * - `model` / `market` are already in display terms (book-convention home line for spreads,
 *   total points for totals, probabilities for prob/pct).
 * - `edge` is the probability edge from model.edges (home side / over); it drives color and
 *   intensity. The shown difference is the point gap (spread/total) or model% − market% (prob).
 * Model is foreground, market is --line blue, only the difference is green/red.
 */
export function EdgeCell({
  model,
  market,
  kind,
  edge,
  title,
  className,
}: {
  model: number | null | undefined;
  market: number | null | undefined;
  kind: EdgeKind;
  edge: number | null | undefined;
  title?: string;
  className?: string;
}) {
  if (model == null || market == null) {
    return (
      <span className={cn("tnum text-dim", className)} data-edge="none">
        —
      </span>
    );
  }
  const dir: Direction = direction(edge);
  const inten: Intensity = intensity(edge);
  let modelText: string;
  let marketText: string;
  let diffText: string;
  if (kind === "spread") {
    modelText = line(model);
    marketText = line(market);
    diffText = signed(market - model, 1); // positive = model likes the home side
  } else if (kind === "total") {
    modelText = model.toFixed(1);
    marketText = market.toFixed(1);
    diffText = signed(model - market, 1); // positive = model likes the over
  } else {
    modelText = pct(model);
    marketText = pct(market);
    diffText = signedPct(model - market, 1);
  }
  return (
    <span
      className={cn("tnum inline-flex items-baseline gap-1 whitespace-nowrap", className)}
      title={title}
      data-edge={dir}
      data-intensity={inten}
    >
      <span className="text-foreground font-semibold">{modelText}</span>
      <span className="text-dim">·</span>
      <span className="text-line font-semibold">{marketText}</span>
      <span className="text-dim">·</span>
      <EdgeDiff dir={dir} inten={inten}>
        {diffText}
      </EdgeDiff>
    </span>
  );
}

/** Colored difference with the intensity ramp. Exported for the chips on VerdictCard. */
export function EdgeDiff({
  dir,
  inten,
  children,
  className,
}: {
  dir: Direction;
  inten: Intensity;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tnum",
        dir === "flat" && "text-edge-flat font-medium",
        dir === "pos" && "text-edge-pos",
        dir === "neg" && "text-edge-neg",
        inten === "mid" && "opacity-70 font-medium",
        inten === "strong" && "opacity-100 font-semibold",
        className,
      )}
      data-edge={dir}
      data-intensity={inten}
    >
      {children}
    </span>
  );
}
