"use client";

import { useId, useMemo, useState } from "react";
import { computeHistStats, type HistogramStats } from "@/lib/holistic-score";
import type { Hist } from "@/lib/types";
import { cn } from "@/lib/utils";

export { computeHistStats, type HistogramStats };

/** Probability of landing strictly above `line`, interpolating proportionally inside a split bin. */
export function probOverLine(hist: Hist | null, line: number | null): number | null {
  if (!hist || line == null || hist.counts.length === 0 || hist.bins.length < 2) return null;
  const { bins, counts } = hist;
  const nBins = Math.min(counts.length, bins.length - 1);
  const total = counts.slice(0, nBins).reduce((a, b) => a + b, 0);
  if (total <= 0) return null;

  let overMass = 0;
  for (let i = 0; i < nBins; i++) {
    const b0 = bins[i]!;
    const b1 = bins[i + 1]!;
    const c = counts[i]!;
    if (b0 >= line) {
      overMass += c;
    } else if (b1 > line && b1 > b0) {
      overMass += c * ((b1 - line) / (b1 - b0));
    }
  }
  return Math.min(1, Math.max(0, overMass / total));
}

/** Build a smooth Catmull-Rom / cubic-bezier SVG path across bin midpoints. */
function buildSmoothCurve(points: { x: number; y: number }[], baselineY: number): { stroke: string; area: string } {
  if (points.length === 0) return { stroke: "", area: "" };
  if (points.length === 1) {
    const p = points[0]!;
    return {
      stroke: `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
      area: `M ${p.x.toFixed(1)} ${baselineY} L ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${p.x.toFixed(1)} ${baselineY} Z`,
    };
  }
  const d: string[] = [`M ${points[0]!.x.toFixed(1)} ${points[0]!.y.toFixed(1)}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = Math.min(baselineY, Math.max(4, p1.y + (p2.y - p0.y) / 6));
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = Math.min(baselineY, Math.max(4, p2.y - (p3.y - p1.y) / 6));
    d.push(`C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`);
  }
  const stroke = d.join(" ");
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const area = `${stroke} L ${last.x.toFixed(1)} ${baselineY} L ${first.x.toFixed(1)} ${baselineY} Z`;
  return { stroke, area };
}

export function VisualHistogram({
  hist,
  line = null,
  fairLine = null,
  mean = null,
  p10 = null,
  p25 = null,
  p75 = null,
  p90 = null,
  title = "Where his yards land",
  unit = "",
  interactive = true,
  className,
}: {
  hist: Hist | null;
  line?: number | null;
  fairLine?: number | null;
  mean?: number | null;
  p10?: number | null;
  p25?: number | null;
  p75?: number | null;
  p90?: number | null;
  title?: string;
  unit?: string;
  interactive?: boolean;
  className?: string;
}) {
  const clipId = useId().replace(/:/g, "");
  const stats = useMemo(() => computeHistStats(hist), [hist]);
  const defaultRefLine = line ?? fairLine ?? stats?.p50 ?? null;
  const [scrubLine, setScrubLine] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const activeLine = scrubLine ?? defaultRefLine;
  const pOver = useMemo(() => probOverLine(hist, activeLine), [hist, activeLine]);

  if (!hist || !stats || hist.counts.length === 0) {
    return (
      <section className={cn("card p-4", className)} data-slot="visual-histogram" aria-label={title}>
        <h2 className="t-body font-semibold">{title}</h2>
        <p className="mt-1 t-caption">No histogram on this run.</p>
      </section>
    );
  }

  const q10 = p10 ?? stats.p10;
  const q25 = p25 ?? stats.p25;
  const q50 = fairLine ?? stats.p50;
  const q75 = p75 ?? stats.p75;
  const q90 = p90 ?? stats.p90;
  const simMean = mean ?? stats.mean;

  const nBins = Math.min(hist.counts.length, hist.bins.length - 1);
  const counts = hist.counts.slice(0, nBins);
  const maxCount = Math.max(1, ...counts);
  const span = Math.max(1e-6, stats.hi - stats.lo);

  const W = 360;
  const H = 136;
  const PAD_X = 8;
  const PAD_TOP = 16;
  const BASE_Y = H - 20;
  const PLOT_W = W - PAD_X * 2;
  const PLOT_H = BASE_Y - PAD_TOP;

  const valToX = (v: number): number => {
    const pct = Math.min(1, Math.max(0, (v - stats.lo) / span));
    return PAD_X + pct * PLOT_W;
  };

  const lineX = activeLine != null ? valToX(activeLine) : null;
  const fairX = q50 != null ? valToX(q50) : null;

  const binGap = 1.5;
  const barW = Math.max(2, (PLOT_W - binGap * (nBins - 1)) / nBins);

  const curvePts = counts.map((c, i) => {
    const x = PAD_X + i * (barW + binGap) + barW / 2;
    const h = (c / maxCount) * PLOT_H;
    return { x, y: BASE_Y - h };
  });
  const { stroke: kdeStroke, area: kdeArea } = buildSmoothCurve(curvePts, BASE_Y);

  const hovered = hoverIdx != null && hoverIdx >= 0 && hoverIdx < nBins
    ? {
        idx: hoverIdx,
        b0: hist.bins[hoverIdx]!,
        b1: hist.bins[hoverIdx + 1]!,
        count: counts[hoverIdx]!,
        share: counts[hoverIdx]! / stats.total,
      }
    : null;

  const qPct = (v: number) => Math.min(100, Math.max(0, ((v - stats.lo) / span) * 100));

  return (
    <section className={cn("card flex flex-col gap-3 p-4", className)} data-slot="visual-histogram" aria-label={title}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="t-body font-semibold">{title}</h2>
          <p className="mt-0.5 t-caption">
            1-in-10 markers at {q10.toFixed(0)} and {q90.toFixed(0)}
            {unit ? ` ${unit}` : ""}.
          </p>
        </div>
        {activeLine != null && pOver != null ? (
          <div className="flex items-center gap-1.5 rounded-md bg-surface-inset px-2.5 py-1 border border-border-soft">
            <span className="t-caption">P(&gt;{activeLine.toFixed(1)})</span>
            <span
              className={cn(
                "t-body tnum font-semibold",
                pOver >= 0.54 ? "text-edge-pos" : pOver <= 0.46 ? "text-edge-neg" : "text-foreground",
              )}
              data-testid="histogram-p-over"
            >
              {(pOver * 100).toFixed(1)}%
            </span>
          </div>
        ) : null}
      </div>

      {/* Summary KPI strip */}
      <div className="grid grid-cols-3 gap-2 rounded-md bg-surface-inset p-2 border border-border-soft">
        <div className="flex flex-col">
          <span className="t-caption">Line</span>
          <span className="t-body tnum font-semibold text-line">
            {activeLine != null ? activeLine.toFixed(1) : "—"}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="t-caption">Sim median</span>
          <span className="t-body tnum font-semibold text-foreground">{q50.toFixed(1)}</span>
        </div>
        <div className="flex flex-col">
          <span className="t-caption">Sim mean</span>
          <span className="t-body tnum font-semibold text-foreground">{simMean.toFixed(1)}</span>
        </div>
      </div>

      {/* SVG 20-bin Histogram + KDE curve */}
      <div className="relative select-none">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-36 w-full overflow-visible"
          role="img"
          aria-label={`${title} distribution histogram`}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            <clipPath id={`over-clip-${clipId}`}>
              <rect
                x={lineX ?? PAD_X}
                y={0}
                width={Math.max(0, W - (lineX ?? PAD_X))}
                height={H}
              />
            </clipPath>
            <clipPath id={`under-clip-${clipId}`}>
              <rect
                x={0}
                y={0}
                width={Math.max(0, lineX ?? W)}
                height={H}
              />
            </clipPath>
          </defs>

          {/* Horizontal baseline */}
          <line
            x1={PAD_X}
            y1={BASE_Y}
            x2={W - PAD_X}
            y2={BASE_Y}
            stroke="var(--border)"
            strokeWidth={1}
          />

          {/* KDE Subtle Area Fill */}
          {kdeArea ? (
            <>
              <path
                d={kdeArea}
                fill="var(--muted-foreground)"
                fillOpacity={0.08}
                clipPath={lineX != null ? `url(#under-clip-${clipId})` : undefined}
              />
              {lineX != null ? (
                <path
                  d={kdeArea}
                  fill="var(--edge-pos)"
                  fillOpacity={0.14}
                  clipPath={`url(#over-clip-${clipId})`}
                />
              ) : null}
            </>
          ) : null}

          {/* 20 Histogram Bars */}
          {counts.map((c, i) => {
            const b0 = hist.bins[i]!;
            const b1 = hist.bins[i + 1]!;
            const x = PAD_X + i * (barW + binGap);
            const h = Math.max(2, (c / maxCount) * PLOT_H);
            const y = BASE_Y - h;
            const isHovered = hoverIdx === i;

            // Determine over/under coloring
            let overFrac = 0;
            if (activeLine != null) {
              if (b0 >= activeLine) overFrac = 1;
              else if (b1 > activeLine && b1 > b0) overFrac = (b1 - activeLine) / (b1 - b0);
            }

            return (
              <g
                key={i}
                onMouseEnter={() => setHoverIdx(i)}
                className="cursor-pointer"
                data-testid={`hist-bin-${i}`}
              >
                {/* Invisible full-height hit target for smooth hover */}
                <rect x={x} y={PAD_TOP} width={barW} height={PLOT_H} fill="transparent" />

                {overFrac <= 0 ? (
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={h}
                    rx={1.5}
                    fill="var(--muted-foreground)"
                    fillOpacity={isHovered ? 0.85 : 0.42}
                  />
                ) : overFrac >= 1 ? (
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={h}
                    rx={1.5}
                    fill="var(--edge-pos)"
                    fillOpacity={isHovered ? 0.95 : 0.78}
                  />
                ) : (
                  <>
                    <rect
                      x={x}
                      y={y}
                      width={barW * (1 - overFrac)}
                      height={h}
                      rx={1}
                      fill="var(--muted-foreground)"
                      fillOpacity={isHovered ? 0.85 : 0.42}
                    />
                    <rect
                      x={x + barW * (1 - overFrac)}
                      y={y}
                      width={barW * overFrac}
                      height={h}
                      rx={1}
                      fill="var(--edge-pos)"
                      fillOpacity={isHovered ? 0.95 : 0.78}
                    />
                  </>
                )}
              </g>
            );
          })}

          {/* Smooth KDE Curve Stroke */}
          {kdeStroke ? (
            <path
              d={kdeStroke}
              fill="none"
              stroke="var(--foreground)"
              strokeOpacity={0.45}
              strokeWidth={1.5}
              strokeLinecap="round"
            />
          ) : null}

          {/* Sim Median / Fair vertical reference line */}
          {fairX != null ? (
            <g aria-label="Sim median marker">
              <line
                x1={fairX}
                y1={PAD_TOP - 4}
                x2={fairX}
                y2={BASE_Y}
                stroke="var(--foreground)"
                strokeWidth={1.5}
                strokeDasharray="2 2"
              />
            </g>
          ) : null}

          {/* Active Prop Line vertical marker */}
          {lineX != null ? (
            <g aria-label="Prop line marker">
              <line
                x1={lineX}
                y1={PAD_TOP - 6}
                x2={lineX}
                y2={BASE_Y}
                stroke="var(--line)"
                strokeWidth={2}
              />
              <circle cx={lineX} cy={PAD_TOP - 6} r={3} fill="var(--line)" />
            </g>
          ) : null}

          {/* X-axis domain labels */}
          <text x={PAD_X} y={H - 4} fill="var(--muted-foreground)" fontSize="11" fontWeight="600">
            {stats.lo.toFixed(0)}
          </text>
          <text
            x={W / 2}
            y={H - 4}
            textAnchor="middle"
            fill="var(--muted-foreground)"
            fontSize="11"
            fontWeight="600"
          >
            {((stats.lo + stats.hi) / 2).toFixed(0)}
          </text>
          <text
            x={W - PAD_X}
            y={H - 4}
            textAnchor="end"
            fill="var(--muted-foreground)"
            fontSize="11"
            fontWeight="600"
          >
            {stats.hi.toFixed(0)}
          </text>
        </svg>

        {/* Hover bin inspection bar */}
        {hovered ? (
          <div
            className="mt-1 flex items-center justify-between rounded-md bg-surface-inset px-2.5 py-1 t-caption border border-border-soft"
            data-testid="hist-tooltip"
          >
            <span className="tnum font-semibold text-foreground">
              Range {hovered.b0.toFixed(1)}–{hovered.b1.toFixed(1)}
              {unit ? ` ${unit}` : ""}
            </span>
            <span className="tnum font-semibold text-foreground">
              {(hovered.share * 100).toFixed(1)}% of draws ({hovered.count.toLocaleString()})
            </span>
          </div>
        ) : null}
      </div>

      {/* Horizontal P10–P25–P50–P75–P90 Quantile Boxplot Strip */}
      <div className="flex flex-col gap-1.5" aria-label="Quantile range">
        <div className="relative h-3 w-full rounded-full bg-muted overflow-hidden border border-border-soft">
          {/* P10 to P90 outer whisker band */}
          <div
            className="absolute inset-y-0 bg-foreground/15"
            style={{
              left: `${qPct(q10)}%`,
              width: `${Math.max(1, qPct(q90) - qPct(q10))}%`,
            }}
          />
          {/* P25 to P75 interquartile box */}
          <div
            className="absolute inset-y-0 bg-line/35 border-x border-line"
            style={{
              left: `${qPct(q25)}%`,
              width: `${Math.max(2, qPct(q75) - qPct(q25))}%`,
            }}
          />
          {/* P50 median tick */}
          <div
            className="absolute inset-y-0 w-0.5 bg-foreground"
            style={{ left: `${qPct(q50)}%` }}
          />
        </div>
        <div className="grid grid-cols-5 text-center t-caption">
          <div className="flex flex-col items-start">
            <span>P10</span>
            <span className="tnum font-semibold text-foreground">{q10.toFixed(0)}</span>
          </div>
          <div className="flex flex-col items-center">
            <span>P25</span>
            <span className="tnum font-semibold text-foreground">{q25.toFixed(0)}</span>
          </div>
          <div className="flex flex-col items-center">
            <span>P50</span>
            <span className="tnum font-semibold text-foreground">{q50.toFixed(1)}</span>
          </div>
          <div className="flex flex-col items-center">
            <span>P75</span>
            <span className="tnum font-semibold text-foreground">{q75.toFixed(0)}</span>
          </div>
          <div className="flex flex-col items-end">
            <span>P90</span>
            <span className="tnum font-semibold text-foreground">{q90.toFixed(0)}</span>
          </div>
        </div>
      </div>

      {/* Interactive custom line scrubber */}
      {interactive ? (
        <div className="flex items-center gap-2 pt-1 border-t border-border-soft">
          <label htmlFor={`scrub-${clipId}`} className="t-caption shrink-0">
            Test line
          </label>
          <input
            id={`scrub-${clipId}`}
            type="range"
            min={stats.lo}
            max={stats.hi}
            step={0.5}
            value={activeLine ?? stats.p50}
            onChange={(e) => setScrubLine(Number(e.target.value))}
            aria-label="Test custom line"
            className="h-1.5 flex-1 cursor-pointer accent-[var(--line)]"
          />
          {scrubLine != null ? (
            <button
              type="button"
              onClick={() => setScrubLine(null)}
              className="t-caption rounded px-1.5 py-0.5 hover:bg-accent text-foreground font-semibold"
            >
              Reset
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
