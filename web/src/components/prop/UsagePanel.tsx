"use client";

import { useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  RATE_LABELS,
  bandsFromHist,
  defenseSentence,
  formatRate,
  metricsFor,
  ordinal,
  rankTier,
  type DefenseVsPosition,
  type PlayerUsage,
  type RateMetric,
  type UsageRates,
  type UsageWindow,
} from "@/lib/usage";
import type { Hist } from "@/lib/types";
import { cn } from "@/lib/utils";

function pct(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

function fixed(v: number | null | undefined, d = 1): string {
  return v == null ? "—" : v.toFixed(d);
}

/** Derive window rates on the fly from `usage.weeks` when a precomputed window is absent. */
function deriveWindowRates(usage: PlayerUsage | null, win: UsageWindow): UsageRates | null {
  if (!usage) return null;
  if (win === "season") return usage.season;
  if (win === "l3") return usage.l3;
  if (win === "l5") {
    if (usage.l5) return usage.l5;
    const slice = usage.weeks.slice(0, 5);
    if (!slice.length) return usage.season;
    const n = slice.length;
    const sumTargets = slice.reduce((a, w) => a + w.targets, 0);
    const sumCarries = slice.reduce((a, w) => a + w.carries, 0);
    const sumOpps = sumTargets + sumCarries;
    const sumRoutes = slice.reduce((a, w) => a + (w.routes_est ?? 0), 0);
    const sumDk = slice.reduce((a, w) => a + (w.fpts_dk ?? 0), 0);
    const sumPpr = slice.reduce((a, w) => a + (w.fpts_ppr ?? 0), 0);
    return {
      ...(usage.season ?? {
        window: "l5",
        games: n,
        dk_pg: null,
        ppr_pg: null,
        half_pg: null,
        std_pg: null,
        ppr_6pt_pg: null,
        fp_per_target: null,
        fp_per_opportunity: null,
        fp_per_touch: null,
        fp_per_snap: null,
        fp_per_route_est: null,
        fp_per_rush: null,
        fp_per_dropback: null,
        fp_per_attempt: null,
        target_share: null,
        snap_pct: null,
        routes_pg_est: null,
        targets_pg: null,
        carries_pg: null,
        yprr_est: null,
        tprr_est: null,
        air_yds_pg: null,
        wopr: null,
      }),
      window: "l5",
      games: n,
      dk_pg: sumDk / n,
      ppr_pg: sumPpr / n,
      fp_per_target: sumTargets > 0 ? sumDk / sumTargets : null,
      fp_per_opportunity: sumOpps > 0 ? sumDk / sumOpps : null,
      fp_per_route_est: sumRoutes > 0 ? sumDk / sumRoutes : null,
      target_share: slice.reduce((a, w) => a + (w.target_share ?? 0), 0) / n,
      snap_pct: slice.reduce((a, w) => a + (w.snap_pct ?? 0), 0) / n,
      routes_pg_est: sumRoutes / n,
      targets_pg: sumTargets / n,
      carries_pg: sumCarries / n,
    };
  }
  return usage.season;
}

/**
 * StatBuilder+ usage, rate stats, league rank matrix, scoring bands and opposing defense.
 * Every number is free data: the weekly box score, snap counts and the sim's own draws.
 */
export function UsagePanel({
  usage,
  position,
  opponent,
  defense,
  fptsHist,
}: {
  usage: PlayerUsage | null;
  position: string | null;
  opponent: string | null;
  defense: DefenseVsPosition | null;
  fptsHist: Hist | null;
}) {
  const [win, setWin] = useState<UsageWindow>("season");
  const rates: UsageRates | null = deriveWindowRates(usage, win);
  const rankOf = new Map(usage?.ranks.map((r) => [r.metric, r]) ?? []);
  const metrics = metricsFor(position);
  const bands = bandsFromHist(fptsHist);
  const hasBands = bands.some((b) => b.p > 0);

  return (
    <section className="card flex flex-col gap-4 p-4" data-slot="usage-panel" aria-label="Usage and rates">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="t-body font-semibold">Usage and rates</h2>
            <span className="rounded bg-surface-inset px-2 py-0.5 t-caption font-semibold text-foreground border border-border-soft">
              StatBuilder
            </span>
          </div>
          <p className="t-caption">
            DraftKings scoring. Ranks are among {position ?? "position"}s with 3+ games and 15+ opportunities this
            season. Routes are estimated from snaps and the team&apos;s dropback rate.
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={win}
          onValueChange={(v) => v && setWin(v as UsageWindow)}
          size="sm"
          spacing={0}
          className="w-fit"
          aria-label="Window"
        >
          <ToggleGroupItem value="season" className="t-caption h-8 px-2.5">
            Season
          </ToggleGroupItem>
          <ToggleGroupItem value="l5" className="t-caption h-8 px-2.5">
            Last 5
          </ToggleGroupItem>
          <ToggleGroupItem value="l3" className="t-caption h-8 px-2.5">
            Last 3
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {!rates || rates.games === 0 ? (
        <p className="t-caption">No graded games this season yet.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {metrics.map((m: RateMetric) => {
            const rank = win === "season" ? rankOf.get(m) : undefined;
            const tier = rank ? rankTier(rank.rank, rank.of) : null;
            const pctFill = rank && rank.of > 1 ? Math.round(((rank.of - rank.rank) / (rank.of - 1)) * 100) : null;
            return (
              <div
                key={m}
                className="flex min-w-0 flex-col justify-between gap-1 rounded-md border border-border-soft bg-surface-inset p-2.5"
              >
                <dt className="t-colhead text-muted-foreground">{RATE_LABELS[m]}</dt>
                <div className="flex items-baseline justify-between gap-2">
                  <dd className="t-body tnum font-semibold text-foreground">{formatRate(m, rates[m])}</dd>
                  <dd className="t-caption">
                    {rank ? (
                      <span
                        className={cn(
                          "inline-flex items-center rounded px-1.5 py-0.5 tnum font-semibold",
                          tier === "good" && "bg-edge-pos-tint text-edge-pos",
                          tier === "bad" && "bg-edge-neg-tint text-edge-neg",
                          tier === "mid" && "bg-card text-muted-foreground",
                        )}
                      >
                        {ordinal(rank.rank)} of {rank.of}
                      </span>
                    ) : (
                      "\u00a0"
                    )}
                  </dd>
                </div>
                {pctFill != null ? (
                  <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
                    <div
                      className={cn(
                        "h-full rounded-full",
                        tier === "good" ? "bg-edge-pos" : tier === "bad" ? "bg-edge-neg" : "bg-foreground/45",
                      )}
                      style={{ width: `${Math.max(6, pctFill)}%` }}
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
        </dl>
      )}

      {rates && rates.games > 0 ? (
        <p className="t-caption">
          {rates.games} games · {fixed(rates.dk_pg)} DK · {fixed(rates.ppr_pg)} PPR · {fixed(rates.half_pg)} half ·{" "}
          {fixed(rates.std_pg)} standard · {fixed(rates.ppr_6pt_pg)} PPR with 6-pt pass TD ·{" "}
          {fixed(rates.targets_pg)} targets and {fixed(rates.carries_pg)} carries per game
        </p>
      ) : null}

      <div>
        <h3 className="t-body font-semibold">Chance of each scoring band this week</h3>
        {!hasBands ? (
          <p className="mt-1 t-caption">No histogram on this run.</p>
        ) : (
          <>
            <div className="mt-2 flex h-7 w-full overflow-hidden rounded-md bg-muted" aria-hidden>
              {bands.map((b, i) => (
                <div
                  key={b.label}
                  className="h-full border-r border-card last:border-r-0"
                  style={{ width: `${b.p * 100}%`, opacity: 0.35 + (i / (bands.length - 1)) * 0.65, background: "var(--foreground)" }}
                />
              ))}
            </div>
            <ul className="mt-2 grid grid-cols-3 gap-x-4 gap-y-1 sm:grid-cols-6" aria-label="Scoring bands">
              {bands.map((b) => (
                <li key={b.label} className="flex justify-between gap-2 t-caption">
                  <span>{b.label}</span>
                  <span className="tnum font-semibold text-foreground">{pct(b.p)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="rounded-md border border-border-soft bg-surface-inset p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="t-body font-semibold">The defense he faces{opponent ? `: ${opponent}` : ""}</h3>
          {defense ? (
            <span
              className={cn(
                "rounded px-2 py-0.5 t-caption tnum font-semibold",
                defense.rank <= 10
                  ? "bg-edge-pos-tint text-edge-pos"
                  : defense.rank >= 23
                    ? "bg-edge-neg-tint text-edge-neg"
                    : "bg-card text-muted-foreground",
              )}
            >
              vs {position ?? defense.position} #{defense.rank} of {defense.of}
            </span>
          ) : null}
        </div>
        <p className="mt-1 t-sentence">{defenseSentence(defense, position)}</p>
      </div>

      <DataTable
        data={usage?.weeks ?? []}
        getRowId={(w) => `${w.season}-${w.week}`}
        empty="No weekly usage yet"
        ariaLabel="Weekly usage"
        syncUrl={false}
        columns={[
          {
            id: "week",
            header: "Week",
            sortValue: (w) => w.week,
            cell: (w) => <span className="t-caption tnum">{w.week}</span>,
          },
          {
            id: "opp",
            header: "Opp",
            sortValue: (w) => w.opponent ?? "",
            cell: (w) => <span className="font-semibold text-foreground">{w.opponent ?? "—"}</span>,
          },
          {
            id: "snaps",
            header: "Snap share",
            group: "USAGE",
            align: "right",
            sortValue: (w) => w.snap_pct,
            cell: (w) => <span className="tnum font-semibold text-foreground">{pct(w.snap_pct)}</span>,
          },
          {
            id: "routes",
            header: "Routes (est.)",
            group: "USAGE",
            align: "right",
            sortValue: (w) => w.routes_est,
            cell: (w) => <span className="tnum font-semibold text-foreground">{fixed(w.routes_est, 0)}</span>,
          },
          {
            id: "targets",
            header: "Targets",
            group: "USAGE",
            align: "right",
            sortValue: (w) => w.targets,
            cell: (w) => <span className="tnum font-semibold text-foreground">{w.targets}</span>,
          },
          {
            id: "share",
            header: "Target share",
            group: "USAGE",
            align: "right",
            sortValue: (w) => w.target_share,
            cell: (w) => <span className="tnum font-semibold text-foreground">{pct(w.target_share)}</span>,
          },
          {
            id: "carries",
            header: "Carries",
            group: "USAGE",
            align: "right",
            sortValue: (w) => w.carries,
            cell: (w) => <span className="tnum font-semibold text-foreground">{w.carries}</span>,
          },
          {
            id: "dk",
            header: "DK",
            group: "FANTASY",
            align: "right",
            sortValue: (w) => w.fpts_dk,
            cell: (w) => <span className="tnum font-semibold text-foreground">{fixed(w.fpts_dk)}</span>,
          },
          {
            id: "ppr",
            header: "PPR",
            group: "FANTASY",
            align: "right",
            sortValue: (w) => w.fpts_ppr,
            cell: (w) => <span className="tnum font-semibold text-foreground">{fixed(w.fpts_ppr)}</span>,
          },
        ]}
      />
    </section>
  );
}
