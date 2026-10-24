"use client";

import { useMemo, useState } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { computeHistStats } from "@/components/prop/VisualHistogram";
import { signed } from "@/lib/edge";
import type { FpWeek, SimWeek } from "@/lib/player-history";
import type { PlayerActualWeek } from "@/lib/player-actuals";
import type { Hist } from "@/lib/types";
import type { DefenseVsPosition, PlayerUsage } from "@/lib/usage";
import { cn } from "@/lib/utils";

type HomeWindow = "LAST 10" | "MONTH" | "SEASON";

type WeekPoint = {
  season: number;
  week: number;
  opponent: string | null;
  scored: number;
  projected: number | null;
  delta: number | null;
};

type PerfSplit = {
  upside: number;
  average: number;
  terrible: number;
};

function buildDonutArcs(split: PerfSplit) {
  const total = Math.max(1e-6, split.upside + split.average + split.terrible);
  const segs = [
    { key: "upside", frac: split.upside / total, color: "var(--edge-pos)" },
    { key: "average", frac: split.average / total, color: "var(--warn)" },
    { key: "terrible", frac: split.terrible / total, color: "var(--edge-neg)" },
  ];
  const R = 32;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return segs.map((s) => {
    const dash = s.frac * C;
    const item = {
      ...s,
      r: R,
      circumference: C,
      strokeDasharray: `${dash.toFixed(2)} ${C.toFixed(2)}`,
      strokeDashoffset: -offset,
    };
    offset += dash;
    return item;
  });
}

function PerformanceDonut({
  title,
  split,
}: {
  title: string;
  split: PerfSplit;
}) {
  const arcs = buildDonutArcs(split);
  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg viewBox="0 0 84 84" className="size-20" role="img" aria-label={`${title} donut chart`}>
        <circle
          cx="42"
          cy="42"
          r="32"
          fill="none"
          stroke="var(--muted)"
          strokeWidth="12"
        />
        <g transform="rotate(-90 42 42)">
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx="42"
              cy="42"
              r={a.r}
              fill="none"
              stroke={a.color}
              strokeWidth="12"
              strokeDasharray={a.strokeDasharray}
              strokeDashoffset={a.strokeDashoffset}
            />
          ))}
        </g>
      </svg>
      <span className="t-caption font-semibold text-foreground">{title}</span>
    </div>
  );
}

/** Build a smooth cubic-bezier SVG density curve across bin midpoints. */
function buildBellPath(points: { x: number; y: number }[], baseY: number): { stroke: string; area: string } {
  if (points.length === 0) return { stroke: "", area: "" };
  if (points.length === 1) {
    const p = points[0]!;
    return {
      stroke: `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
      area: `M ${p.x.toFixed(1)} ${baseY} L ${p.x.toFixed(1)} ${p.y.toFixed(1)} L ${p.x.toFixed(1)} ${baseY} Z`,
    };
  }
  const d: string[] = [`M ${points[0]!.x.toFixed(1)} ${points[0]!.y.toFixed(1)}`];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = Math.min(baseY, Math.max(6, p1.y + (p2.y - p0.y) / 6));
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = Math.min(baseY, Math.max(6, p2.y - (p3.y - p1.y) / 6));
    d.push(`C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`);
  }
  const stroke = d.join(" ");
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return {
    stroke,
    area: `${stroke} L ${last.x.toFixed(1)} ${baseY} L ${first.x.toFixed(1)} ${baseY} Z`,
  };
}

export function PlayerHomeCards({
  actualRows = [],
  projections = [],
  simProjections = [],
  fptsHist = null,
  usage = null,
  defense = null,
  currentSeason,
  salary = null,
}: {
  actualRows?: PlayerActualWeek[];
  projections?: FpWeek[];
  simProjections?: SimWeek[];
  fptsHist?: Hist | null;
  usage?: PlayerUsage | null;
  defense?: DefenseVsPosition | null;
  currentSeason: number;
  salary?: number | null;
}) {
  const [win, setWin] = useState<HomeWindow>("LAST 10");

  const allPoints = useMemo<WeekPoint[]>(() => {
    const simMap = new Map(simProjections.map((p) => [`${p.season}-${p.week}`, p.fpts_dk]));
    const fpMap = new Map(projections.map((p) => [`${p.season}-${p.week}`, p.fpts_dk]));
    const played = actualRows
      .filter((r) => r.had_opportunity && Number.isFinite(r.fpts_dk))
      .sort((a, b) => (a.season !== b.season ? a.season - b.season : a.week - b.week));
    return played.map((r) => {
      const key = `${r.season}-${r.week}`;
      const proj = simMap.get(key) ?? fpMap.get(key) ?? null;
      return {
        season: r.season,
        week: r.week,
        opponent: r.opponent,
        scored: r.fpts_dk,
        projected: proj,
        delta: proj != null ? r.fpts_dk - proj : null,
      };
    });
  }, [actualRows, projections, simProjections]);

  const fallbackTypical = useMemo(() => {
    if (!allPoints.length) return null;
    return allPoints.reduce((acc, p) => acc + p.scored, 0) / allPoints.length;
  }, [allPoints]);

  const series = useMemo(() => {
    const base =
      win === "SEASON"
        ? allPoints.filter((p) => p.season === currentSeason)
        : win === "MONTH"
          ? allPoints.slice(-4)
          : allPoints.slice(-10);
    const active = base.length ? base : allPoints.slice(-10);
    return active.map((p) => {
      const refProj = p.projected ?? fallbackTypical ?? p.scored;
      const delta = p.scored - refProj;
      return { ...p, refProj, delta };
    });
  }, [allPoints, win, currentSeason, fallbackTypical]);

  const summary = useMemo(() => {
    if (!series.length) {
      return {
        avgPlusMinus: null as number | null,
        pctExceed: null as number | null,
        trendDelta: null as number | null,
        playerSplit: { upside: 0.2, average: 0.6, terrible: 0.2 },
      };
    }
    const avgPlusMinus = series.reduce((acc, s) => acc + s.delta, 0) / series.length;
    const exceedCount = series.filter((s) => s.delta >= 0).length;
    const pctExceed = (exceedCount / series.length) * 100;
    const firstProj = series[0]!.refProj;
    const lastProj = series[series.length - 1]!.refProj;
    const trendDelta = lastProj - firstProj;

    let upside = 0;
    let average = 0;
    let terrible = 0;
    for (const s of series) {
      if (s.delta >= 4) upside += 1;
      else if (s.delta <= -4) terrible += 1;
      else average += 1;
    }
    return {
      avgPlusMinus,
      pctExceed,
      trendDelta,
      playerSplit: {
        upside: upside / series.length,
        average: average / series.length,
        terrible: terrible / series.length,
      },
    };
  }, [series]);

  const histStats = useMemo(() => computeHistStats(fptsHist), [fptsHist]);

  const latestProj = useMemo(() => {
    if (histStats) return histStats.mean;
    const latestSim = simProjections.at(-1)?.fpts_dk;
    if (latestSim != null) return latestSim;
    const latestFp = projections.at(-1)?.fpts_dk;
    if (latestFp != null) return latestFp;
    return usage?.season?.dk_pg ?? fallbackTypical ?? null;
  }, [histStats, simProjections, projections, usage, fallbackTypical]);

  const projCeiling = histStats ? histStats.p90 : latestProj != null ? latestProj * 1.45 : null;
  const projFloor = histStats ? histStats.p10 : latestProj != null ? latestProj * 0.55 : null;
  const projPlusMinus =
    latestProj != null && (usage?.season?.dk_pg ?? fallbackTypical) != null
      ? latestProj - (usage?.season?.dk_pg ?? fallbackTypical ?? 0)
      : summary.avgPlusMinus;
  const ptsPerSal =
    latestProj != null && salary != null && salary > 0
      ? latestProj / (salary / 1000)
      : latestProj != null
        ? latestProj / 5.5
        : null;

  // Bell curve SVG coordinates
  const bellCurve = useMemo(() => {
    const W = 320;
    const H = 132;
    const PAD_X = 16;
    const BASE_Y = H - 22;
    const PLOT_W = W - PAD_X * 2;
    const PLOT_H = BASE_Y - 16;

    if (fptsHist && fptsHist.counts.length > 1) {
      const n = Math.min(fptsHist.counts.length, fptsHist.bins.length - 1);
      const maxC = Math.max(1, ...fptsHist.counts.slice(0, n));
      const pts = fptsHist.counts.slice(0, n).map((c, i) => ({
        x: PAD_X + (i / Math.max(1, n - 1)) * PLOT_W,
        y: BASE_Y - (c / maxC) * PLOT_H,
      }));
      return {
        ...buildBellPath(pts, BASE_Y),
        lo: fptsHist.bins[0] ?? 0,
        mid: latestProj ?? 15,
        hi: fptsHist.bins[n] ?? 30,
        W,
        H,
        BASE_Y,
        PAD_X,
      };
    }

    // Smooth normal approximation when draw histogram is absent
    const center = latestProj ?? 14;
    const spread = Math.max(4, (projCeiling ?? center + 8) - center);
    const lo = Math.max(0, center - spread * 1.4);
    const hi = center + spread * 1.4;
    const steps = 19;
    const pts = Array.from({ length: steps }, (_, i) => {
      const t = i / (steps - 1);
      const z = (t - 0.5) * 4.4;
      const density = Math.exp(-0.5 * z * z);
      return {
        x: PAD_X + t * PLOT_W,
        y: BASE_Y - density * PLOT_H,
      };
    });
    return {
      ...buildBellPath(pts, BASE_Y),
      lo,
      mid: center,
      hi,
      W,
      H,
      BASE_Y,
      PAD_X,
    };
  }, [fptsHist, latestProj, projCeiling]);

  // 0-100 Ratings bars derived from usage ranks, consistency, and defense matchup
  const ratings = useMemo(() => {
    const rankMap = new Map(usage?.ranks.map((r) => [r.metric, r]) ?? []);
    const rankToPct = (metric: "dk_pg" | "target_share" | "snap_pct" | "fp_per_opportunity", fallback: number) => {
      const rk = rankMap.get(metric);
      if (!rk || rk.of <= 1) return fallback;
      return Math.round(((rk.of - rk.rank) / (rk.of - 1)) * 99);
    };

    const exceedPct = summary.pctExceed != null ? Math.round(summary.pctExceed) : 55;
    const upsidePct = Math.round(summary.playerSplit.upside * 100);
    const oppPct =
      defense && defense.of > 1
        ? Math.round(((defense.of - defense.rank) / (defense.of - 1)) * 99)
        : 52;
    const ceilScore = projCeiling != null ? Math.min(99, Math.max(12, Math.round((projCeiling / 32) * 100))) : 64;
    const floorScore = projFloor != null ? Math.min(99, Math.max(10, Math.round((projFloor / 18) * 100))) : 54;
    const medScore = rankToPct("dk_pg", latestProj != null ? Math.min(99, Math.round((latestProj / 24) * 100)) : 60);
    const pmScore =
      projPlusMinus != null
        ? Math.min(99, Math.max(5, Math.round(50 + projPlusMinus * 6)))
        : 56;
    const valScore =
      ptsPerSal != null
        ? Math.min(99, Math.max(10, Math.round((ptsPerSal / 4.2) * 100)))
        : rankToPct("fp_per_opportunity", 58);

    return [
      { label: "Projected Ceiling", value: ceilScore },
      { label: "Projected Floor", value: floorScore },
      { label: "Projected Plus/Minus %", value: pmScore },
      { label: "Median Pts", value: medScore },
      { label: "Pt/Sal Percentile", value: valScore },
      { label: "Consistency", value: exceedPct },
      { label: "Upside", value: Math.min(99, Math.max(15, upsidePct * 2)) },
      { label: "Snap & Role Share", value: rankToPct("snap_pct", 65) },
      { label: "Opportunity Efficiency", value: rankToPct("fp_per_opportunity", 60) },
      { label: "Opponent Rating", value: oppPct },
    ];
  }, [usage, summary, defense, projCeiling, projFloor, latestProj, projPlusMinus, ptsPerSal]);

  // Bar + Line SVG chart dimensions for Points vs Projected
  const chartW = 360;
  const chartH = 150;
  const padX = 24;
  const padTop = 14;
  const baseY = chartH - 22;
  const plotW = chartW - padX * 2;
  const plotH = baseY - padTop;
  const maxY = Math.max(
    25,
    ...series.map((s) => Math.max(s.scored, s.refProj)),
  );

  return (
    <section
      className="grid grid-cols-1 gap-4 lg:grid-cols-12"
      data-slot="player-home-cards"
      aria-label="Player home overview"
    >
      {/* Left Card: Points vs Projected (7 cols on lg) */}
      <div className="card flex flex-col justify-between gap-4 p-4 lg:col-span-7">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-soft pb-2.5">
          <h2 className="t-body font-semibold">Points vs. Projected</h2>
          <ToggleGroup
            type="single"
            value={win}
            onValueChange={(v) => v && setWin(v as HomeWindow)}
            size="sm"
            spacing={0}
            aria-label="Points vs Projected window"
          >
            {(["LAST 10", "MONTH", "SEASON"] as const).map((w) => (
              <ToggleGroupItem key={w} value={w} className="t-caption h-8 px-2.5">
                {w}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {/* 3 Summary KPIs */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="flex flex-col items-center rounded-md bg-surface-inset p-2 border border-border-soft">
            <span
              className={cn(
                "t-title tnum font-bold",
                summary.avgPlusMinus == null
                  ? "text-foreground"
                  : summary.avgPlusMinus >= 0
                    ? "text-edge-pos"
                    : "text-edge-neg",
              )}
            >
              {summary.avgPlusMinus != null ? signed(summary.avgPlusMinus, 2) : "—"}
            </span>
            <span className="t-caption text-muted-foreground">Avg +/-</span>
          </div>
          <div className="flex flex-col items-center rounded-md bg-surface-inset p-2 border border-border-soft">
            <span className="t-title tnum font-bold text-foreground">
              {summary.pctExceed != null ? `${summary.pctExceed.toFixed(1)}%` : "—"}
            </span>
            <span className="t-caption text-muted-foreground">Pct Exceed</span>
          </div>
          <div className="flex flex-col items-center rounded-md bg-surface-inset p-2 border border-border-soft">
            <span
              className={cn(
                "t-title tnum font-bold",
                summary.trendDelta == null
                  ? "text-foreground"
                  : summary.trendDelta >= 0
                    ? "text-edge-pos"
                    : "text-edge-neg",
              )}
            >
              {summary.trendDelta != null ? `${signed(summary.trendDelta, 1)} pts` : "—"}
            </span>
            <span className="t-caption text-muted-foreground">Proj Change</span>
          </div>
        </div>

        {/* Weekly Bar + Projection Line SVG + Performance Donuts */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:items-center">
          <div className="md:col-span-7">
            {series.length === 0 ? (
              <p className="t-caption py-8 text-center">No graded games logged in this window yet.</p>
            ) : (
              <svg
                viewBox={`0 0 ${chartW} ${chartH}`}
                className="h-40 w-full overflow-visible"
                role="img"
                aria-label="Weekly points versus projection chart"
              >
                {/* Horizontal grid lines */}
                {[0, 0.5, 1].map((frac) => {
                  const y = baseY - frac * plotH;
                  const val = Math.round(frac * maxY);
                  return (
                    <g key={frac}>
                      <line
                        x1={padX}
                        y1={y}
                        x2={chartW - padX}
                        y2={y}
                        stroke="var(--border-soft)"
                        strokeDasharray={frac === 0 ? undefined : "2 2"}
                      />
                      <text
                        x={padX - 4}
                        y={y + 3}
                        textAnchor="end"
                        fill="var(--muted-foreground)"
                        fontSize="10"
                      >
                        {val}
                      </text>
                    </g>
                  );
                })}

                {/* Weekly Scored Bars */}
                {series.map((s, idx) => {
                  const step = plotW / Math.max(1, series.length);
                  const barW = Math.min(20, Math.max(6, step * 0.58));
                  const x = padX + idx * step + (step - barW) / 2;
                  const h = Math.max(2, (Math.max(0, s.scored) / maxY) * plotH);
                  const y = baseY - h;
                  const beat = s.delta >= 0;
                  return (
                    <g key={`${s.season}-${s.week}`}>
                      <rect
                        x={x}
                        y={y}
                        width={barW}
                        height={h}
                        rx={2}
                        fill={beat ? "var(--edge-pos)" : "var(--edge-neg)"}
                        fillOpacity={0.85}
                      />
                      <text
                        x={x + barW / 2}
                        y={chartH - 6}
                        textAnchor="middle"
                        fill="var(--muted-foreground)"
                        fontSize="10"
                      >
                        W{s.week}
                      </text>
                    </g>
                  );
                })}

                {/* Projection Overlay Polyline */}
                {series.length > 1 ? (
                  <polyline
                    fill="none"
                    stroke="var(--foreground)"
                    strokeWidth={2}
                    points={series
                      .map((s, idx) => {
                        const step = plotW / Math.max(1, series.length);
                        const cx = padX + idx * step + step / 2;
                        const cy = baseY - (Math.max(0, s.refProj) / maxY) * plotH;
                        return `${cx.toFixed(1)},${cy.toFixed(1)}`;
                      })
                      .join(" ")}
                  />
                ) : null}

                {series.map((s, idx) => {
                  const step = plotW / Math.max(1, series.length);
                  const cx = padX + idx * step + step / 2;
                  const cy = baseY - (Math.max(0, s.refProj) / maxY) * plotH;
                  return (
                    <circle
                      key={`pt-${s.season}-${s.week}`}
                      cx={cx}
                      cy={cy}
                      r={3}
                      fill="var(--card)"
                      stroke="var(--foreground)"
                      strokeWidth={1.75}
                    />
                  );
                })}
              </svg>
            )}
          </div>

          {/* Performance Donuts */}
          <div className="flex flex-col items-center gap-2 md:col-span-5">
            <div className="flex items-center justify-center gap-4">
              <PerformanceDonut title="Player Performance" split={summary.playerSplit} />
              <PerformanceDonut
                title="Avg Performance"
                split={{ upside: 0.2, average: 0.6, terrible: 0.2 }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 t-caption">
              <span className="inline-flex items-center gap-1">
                <span className="size-2.5 rounded-sm bg-edge-pos" aria-hidden />
                Upside
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2.5 rounded-sm bg-warn" aria-hidden />
                Average
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2.5 rounded-sm bg-edge-neg" aria-hidden />
                Terrible
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Projections Bell Curve + Ratings Bars (5 cols on lg) */}
      <div className="flex flex-col gap-4 lg:col-span-5">
        {/* Projections Bell Curve Card */}
        <div className="card flex flex-col justify-between gap-3 p-4" data-slot="projections-bell-card">
          <div className="flex items-center justify-between border-b border-border-soft pb-2">
            <h2 className="t-body font-semibold">Sim Range</h2>
            <span className="t-caption text-muted-foreground">Sim density curve</span>
          </div>

          <svg
            viewBox={`0 0 ${bellCurve.W} ${bellCurve.H}`}
            className="h-32 w-full overflow-visible"
            role="img"
            aria-label="Projected fantasy points density curve"
          >
            <line
              x1={bellCurve.PAD_X}
              y1={bellCurve.BASE_Y}
              x2={bellCurve.W - bellCurve.PAD_X}
              y2={bellCurve.BASE_Y}
              stroke="var(--border)"
              strokeWidth={1}
            />
            {bellCurve.area ? (
              <path d={bellCurve.area} fill="var(--line)" fillOpacity={0.14} />
            ) : null}
            {bellCurve.stroke ? (
              <path
                d={bellCurve.stroke}
                fill="none"
                stroke="var(--foreground)"
                strokeWidth={2}
                strokeLinecap="round"
              />
            ) : null}
            <line
              x1={bellCurve.W / 2}
              y1={16}
              x2={bellCurve.W / 2}
              y2={bellCurve.BASE_Y}
              stroke="var(--line)"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
            <text
              x={bellCurve.PAD_X}
              y={bellCurve.H - 4}
              fill="var(--muted-foreground)"
              fontSize="11"
              fontWeight="600"
            >
              {bellCurve.lo.toFixed(1)}
            </text>
            <text
              x={bellCurve.W / 2}
              y={bellCurve.H - 4}
              textAnchor="middle"
              fill="var(--foreground)"
              fontSize="11"
              fontWeight="700"
            >
              {bellCurve.mid.toFixed(1)}
            </text>
            <text
              x={bellCurve.W - bellCurve.PAD_X}
              y={bellCurve.H - 4}
              textAnchor="end"
              fill="var(--muted-foreground)"
              fontSize="11"
              fontWeight="600"
            >
              {bellCurve.hi.toFixed(1)}
            </text>
          </svg>

          <div className="grid grid-cols-5 gap-1.5 border-t border-border-soft pt-2.5 text-center">
            <div className="flex flex-col">
              <span className="t-body tnum font-bold text-foreground">
                {latestProj != null ? latestProj.toFixed(1) : "—"}
              </span>
              <span className="t-caption text-muted-foreground">Pts</span>
            </div>
            <div className="flex flex-col">
              <span className="t-body tnum font-bold text-foreground">
                {projCeiling != null ? projCeiling.toFixed(1) : "—"}
              </span>
              <span className="t-caption text-muted-foreground">Ceiling</span>
            </div>
            <div className="flex flex-col">
              <span className="t-body tnum font-bold text-foreground">
                {projFloor != null ? projFloor.toFixed(1) : "—"}
              </span>
              <span className="t-caption text-muted-foreground">Floor</span>
            </div>
            <div className="flex flex-col">
              <span
                className={cn(
                  "t-body tnum font-bold",
                  projPlusMinus == null
                    ? "text-foreground"
                    : projPlusMinus >= 0
                      ? "text-edge-pos"
                      : "text-edge-neg",
                )}
              >
                {projPlusMinus != null ? signed(projPlusMinus, 2) : "—"}
              </span>
              <span className="t-caption text-muted-foreground">Proj +/-</span>
            </div>
            <div className="flex flex-col">
              <span className="t-body tnum font-bold text-foreground">
                {ptsPerSal != null ? ptsPerSal.toFixed(1) : "—"}
              </span>
              <span className="t-caption text-muted-foreground">Pts/Sal</span>
            </div>
          </div>
        </div>

        {/* Ratings 0-100 Horizontal Progress Bars Card */}
        <div className="card flex flex-col gap-2.5 p-4" data-slot="player-ratings-card">
          <div className="flex items-center justify-between border-b border-border-soft pb-2">
            <h2 className="t-body font-semibold">Ratings</h2>
            <span className="t-caption text-muted-foreground">0–99 percentile</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ratings.map((r) => (
              <div key={r.label} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="t-caption text-foreground truncate">{r.label}</span>
                  <span className="t-caption tnum font-bold text-foreground">{r.value}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      "h-full rounded-full",
                      r.value >= 70
                        ? "bg-edge-pos"
                        : r.value <= 30
                          ? "bg-edge-neg"
                          : "bg-line",
                    )}
                    style={{ width: `${Math.max(6, Math.min(100, r.value))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
