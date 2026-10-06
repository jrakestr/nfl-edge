import { direction, type Direction } from "@/lib/edge";
import { cn } from "@/lib/utils";

export const LINE_LO = -14;
export const LINE_HI = 14;
export const LINE_SPAN = LINE_HI - LINE_LO;
export const TRACK_PX = 144;

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function linePos(v: number): number {
  return (clamp(v, LINE_LO, LINE_HI) - LINE_LO) / LINE_SPAN;
}

function probPos(v: number): number {
  return clamp(v, 0, 1);
}

/**
 * Recessed 144px rail. Spread uses a shared −14…+14 home-book domain (not self-scaled).
 * Total / ML use 0–1. Model tick is foreground; book is --line; fill is the edge tint.
 */
export function GapTrack({
  kind,
  model,
  market,
  edge,
  className,
}: {
  kind: "line" | "prob";
  model: number | null | undefined;
  market: number | null | undefined;
  edge?: number | null;
  className?: string;
}) {
  if (model == null || market == null || Number.isNaN(model) || Number.isNaN(market)) {
    return (
      <span
        className={cn("inline-block h-2.5", className)}
        style={{ width: TRACK_PX }}
        data-gap-track={kind}
        data-empty=""
        aria-label="No line comparison"
      />
    );
  }

  const a = kind === "line" ? linePos(model) : probPos(model);
  const b = kind === "line" ? linePos(market) : probPos(market);
  const left = Math.min(a, b);
  const width = Math.abs(a - b);
  const dir: Direction = direction(edge ?? (kind === "line" ? market - model : model - market));
  const fill =
    dir === "neg" ? "bg-edge-neg-tint" : dir === "pos" ? "bg-edge-pos-tint" : "bg-border-soft";
  const modelClamped = kind === "line" && (model < LINE_LO || model > LINE_HI);
  const marketClamped = kind === "line" && (market < LINE_LO || market > LINE_HI);
  const label =
    kind === "line"
      ? `Our line ${model.toFixed(1)}, book ${market.toFixed(1)}`
      : `Our ${Math.round(model * 100)}%, book ${Math.round(market * 100)}%`;

  return (
    <span
      className={cn("relative inline-block h-2.5", className)}
      style={{ width: TRACK_PX }}
      data-gap-track={kind}
      data-fill-ratio={String(width)}
      data-model-pos={String(a)}
      data-market-pos={String(b)}
      data-clamped={modelClamped || marketClamped ? "1" : "0"}
      data-edge={dir}
      aria-label={label}
    >
      <span className="absolute inset-y-0 left-0 right-0 rounded-sm bg-muted ring-1 ring-border-soft" />
      {width > 0 ? (
        <span
          className={cn("absolute inset-y-0 rounded-sm", fill)}
          style={{ left: `${left * 100}%`, width: `${width * 100}%` }}
          data-gap-fill=""
        />
      ) : null}
      <span
        className="absolute top-1/2 w-0.5 h-2.5 -translate-y-1/2 bg-foreground"
        style={{ left: `calc(${a * 100}% - 1px)` }}
        data-mark="model"
      />
      <span
        className="absolute top-1/2 w-0.5 h-2.5 -translate-y-1/2 bg-line"
        style={{ left: `calc(${b * 100}% - 1px)` }}
        data-mark="market"
      />
    </span>
  );
}
