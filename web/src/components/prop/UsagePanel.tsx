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
  type DefenseVsPosition,
  type PlayerUsage,
  type RateMetric,
  type UsageRates,
  type UsageWindow,
} from "@/lib/usage";
import type { Hist } from "@/lib/types";

function pct(v: number | null | undefined): string {
  return v == null ? "—" : `${Math.round(v * 100)}%`;
}

function fixed(v: number | null | undefined, d = 1): string {
  return v == null ? "—" : v.toFixed(d);
}

/**
 * Usage, rate stats, scoring bands and the defense he faces. Every number is free data: the
 * weekly box score, snap counts and the sim's own draws. Routes are an estimate and say so.
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
  const rates: UsageRates | null = usage ? (win === "l3" ? usage.l3 : usage.season) : null;
  const rankOf = new Map(usage?.ranks.map((r) => [r.metric, r]) ?? []);
  const metrics = metricsFor(position);
  const bands = bandsFromHist(fptsHist);
  const hasBands = bands.some((b) => b.p > 0);

  return (
    <section className="card flex flex-col gap-4 p-4" data-slot="usage-panel" aria-label="Usage and rates">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="t-body font-semibold">Usage and rates</h2>
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
          <ToggleGroupItem value="season" className="t-caption h-8 px-2">
            Season
          </ToggleGroupItem>
          <ToggleGroupItem value="l3" className="t-caption h-8 px-2">
            Last 3
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {!rates || rates.games === 0 ? (
        <p className="t-caption">No graded games this season yet.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-5">
          {metrics.map((m: RateMetric) => {
            const rank = win === "season" ? rankOf.get(m) : undefined;
            return (
              <div key={m} className="min-w-0">
                <dt className="t-colhead text-muted-foreground">{RATE_LABELS[m]}</dt>
                <dd className="t-body tnum font-semibold text-foreground">{formatRate(m, rates[m])}</dd>
                <dd className="t-caption">{rank ? `${ordinal(rank.rank)} of ${rank.of}` : " "}</dd>
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

      <div>
        <h3 className="t-body font-semibold">The defense he faces{opponent ? `: ${opponent}` : ""}</h3>
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
            align: "right",
            sortValue: (w) => w.snap_pct,
            cell: (w) => <span className="tnum font-semibold text-foreground">{pct(w.snap_pct)}</span>,
          },
          {
            id: "routes",
            header: "Routes (est.)",
            align: "right",
            sortValue: (w) => w.routes_est,
            cell: (w) => <span className="tnum font-semibold text-foreground">{fixed(w.routes_est, 0)}</span>,
          },
          {
            id: "targets",
            header: "Targets",
            align: "right",
            sortValue: (w) => w.targets,
            cell: (w) => <span className="tnum font-semibold text-foreground">{w.targets}</span>,
          },
          {
            id: "share",
            header: "Target share",
            align: "right",
            sortValue: (w) => w.target_share,
            cell: (w) => <span className="tnum font-semibold text-foreground">{pct(w.target_share)}</span>,
          },
          {
            id: "carries",
            header: "Carries",
            align: "right",
            sortValue: (w) => w.carries,
            cell: (w) => <span className="tnum font-semibold text-foreground">{w.carries}</span>,
          },
          {
            id: "dk",
            header: "DK",
            align: "right",
            sortValue: (w) => w.fpts_dk,
            cell: (w) => <span className="tnum font-semibold text-foreground">{fixed(w.fpts_dk)}</span>,
          },
          {
            id: "ppr",
            header: "PPR",
            align: "right",
            sortValue: (w) => w.fpts_ppr,
            cell: (w) => <span className="tnum font-semibold text-foreground">{fixed(w.fpts_ppr)}</span>,
          },
        ]}
      />
    </section>
  );
}
