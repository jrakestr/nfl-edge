"use client";

import { useMemo, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  buildPlayerAnalysis,
  countLabel,
  deltaLabel,
  deltaTone,
  pointsLabel,
  scoredLabel,
  type FpWeek,
  type SimWeek,
} from "@/lib/player-history";
import type { PlayerActualWeek } from "@/lib/player-actuals";
import type { PlayerWeek } from "@/lib/types";
import { cn } from "@/lib/utils";

type SplitMode = "all" | "l5" | "l3" | "home" | "away";

/** Unified weekly game log: DraftKings scored, Sim DK, FantasyPros DK, and position counting stats. */
export function PlayerAnalysis({
  position,
  season,
  week,
  log,
  actuals,
  projections,
  simProjections = [],
}: {
  position: string | null;
  season: number;
  week: number;
  log: PlayerWeek[];
  actuals: PlayerActualWeek[];
  projections: FpWeek[];
  simProjections?: SimWeek[];
}) {
  const [split, setSplit] = useState<SplitMode>("all");
  const [oppQuery, setOppQuery] = useState("");
  const model = buildPlayerAnalysis({
    position,
    season,
    week,
    log,
    actuals,
    projections,
    simProjections,
  });

  const filteredRows = useMemo(() => {
    let base = model.rows;
    if (split !== "all") {
      const completed = model.rows.filter((r) => !r.upcoming && !r.dnp);
      if (split === "l5") {
        const keys = new Set(completed.slice(-5).map((r) => r.key));
        base = model.rows.filter((r) => keys.has(r.key));
      } else if (split === "l3") {
        const keys = new Set(completed.slice(-3).map((r) => r.key));
        base = model.rows.filter((r) => keys.has(r.key));
      } else if (split === "home") {
        base = model.rows.filter((r) => r.homeAway === "home");
      } else if (split === "away") {
        base = model.rows.filter((r) => r.homeAway === "away");
      }
    }
    const q = oppQuery.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) => (r.opponent ?? "").toLowerCase().includes(q));
  }, [model.rows, split, oppQuery]);

  const totals = useMemo(() => {
    const completed = filteredRows.filter((r) => !r.upcoming && !r.dnp);
    const sumField = (fn: (r: (typeof filteredRows)[number]) => number | null) => {
      let sum = 0;
      let has = false;
      for (const r of completed) {
        const v = fn(r);
        if (v != null && Number.isFinite(v)) {
          sum += v;
          has = true;
        }
      }
      return has ? sum : null;
    };
    const statSums: Record<string, number | null> = {};
    for (const col of model.columns) {
      statSums[col.id] = sumField((r) => r.values[col.id] ?? null);
    }
    return {
      scored: sumField((r) => r.scored),
      simProjected: sumField((r) => r.simProjected),
      projected: sumField((r) => r.projected),
      delta: sumField((r) => r.delta),
      statSums,
    };
  }, [filteredRows, model.columns]);

  return (
    <section className="card p-4" aria-label="Season game log">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="t-body font-semibold">Season game log</h2>
          <p className="mt-1 t-caption">
            {season} regular season · DraftKings points and{" "}
            {position ? `${position} counting stats` : "counting stats"} through Week {week}.
          </p>
        </div>
        {!model.empty ? (
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="search"
              value={oppQuery}
              onChange={(e) => setOppQuery(e.target.value)}
              placeholder="Filter by opponent"
              aria-label="Filter by opponent"
              className="h-8 w-44"
            />
            <ToggleGroup
              type="single"
              value={split}
              onValueChange={(v) => v && setSplit(v as SplitMode)}
              size="sm"
              spacing={0}
              className="w-fit"
              aria-label="Game log split"
            >
              <ToggleGroupItem value="all" className="t-caption h-8 px-2.5">
                All
              </ToggleGroupItem>
              <ToggleGroupItem value="l5" className="t-caption h-8 px-2.5">
                L5
              </ToggleGroupItem>
              <ToggleGroupItem value="l3" className="t-caption h-8 px-2.5">
                L3
              </ToggleGroupItem>
              <ToggleGroupItem value="home" className="t-caption h-8 px-2.5">
                Home
              </ToggleGroupItem>
              <ToggleGroupItem value="away" className="t-caption h-8 px-2.5">
                Away
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        ) : null}
      </div>
      {model.empty ? (
        <p className="mt-3 t-body">{model.empty}</p>
      ) : (
        <div className="mt-3">
          <DataTable
            data={filteredRows}
            getRowId={(row) => row.key}
            empty="No weekly game log"
            ariaLabel="Season game log"
            syncUrl={false}
            defaultSort={{ id: "week", dir: "asc" }}
            columns={[
              {
                id: "week",
                header: "Week",
                align: "right",
                sortValue: (row) => row.week,
                footer: "Totals",
                cell: (row) => (
                  <span className="font-semibold text-foreground">
                    <span className="tnum">{row.week}</span>
                    {row.upcoming ? (
                      <span className="t-caption font-medium"> Projection</span>
                    ) : null}
                  </span>
                ),
              },
              {
                id: "opp",
                header: "Opp",
                sortValue: (row) => row.opponent ?? "",
                cell: (row) => (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                    {row.outcome ? (
                      <span
                        className={cn(
                          "inline-flex size-5 items-center justify-center rounded t-caption font-bold",
                          row.outcome === "W" && "bg-edge-pos-tint text-edge-pos",
                          row.outcome === "L" && "bg-edge-neg-tint text-edge-neg",
                          row.outcome === "T" && "bg-muted text-muted-foreground",
                        )}
                      >
                        {row.outcome}
                      </span>
                    ) : null}
                    <span>{row.opponent ?? "—"}</span>
                    {row.scoreLabel ? (
                      <span className="t-caption tnum">({row.scoreLabel})</span>
                    ) : null}
                  </span>
                ),
              },
              {
                id: "scored",
                header: "Scored DK",
                group: "FANTASY",
                align: "right",
                sortValue: (row) => row.scored,
                footer: pointsLabel(totals.scored),
                cell: (row) => (
                  <span className="tnum font-semibold text-foreground">{scoredLabel(row)}</span>
                ),
              },
              {
                id: "sim",
                header: "Sim DK",
                group: "FANTASY",
                align: "right",
                sortValue: (row) => row.simProjected,
                footer: pointsLabel(totals.simProjected),
                cell: (row) => (
                  <span className="tnum font-semibold text-foreground">
                    {pointsLabel(row.simProjected)}
                  </span>
                ),
              },
              {
                id: "projected",
                header: "FantasyPros",
                group: "FANTASY",
                align: "right",
                sortValue: (row) => row.projected,
                footer: pointsLabel(totals.projected),
                cell: (row) => (
                  <span className="tnum font-semibold text-foreground">
                    {pointsLabel(row.projected)}
                  </span>
                ),
              },
              {
                id: "delta",
                header: "Delta",
                group: "FANTASY",
                align: "right",
                sortValue: (row) => row.delta,
                footer: (
                  <span
                    className={cn(
                      "tnum font-semibold",
                      deltaTone(totals.delta) === "pos" && "text-edge-pos",
                      deltaTone(totals.delta) === "neg" && "text-edge-neg",
                    )}
                  >
                    {deltaLabel(totals.delta)}
                  </span>
                ),
                cell: (row) => {
                  const tone = deltaTone(row.delta);
                  return (
                    <span
                      className={cn(
                        "tnum font-semibold",
                        tone === "pos" && "text-edge-pos",
                        tone === "neg" && "text-edge-neg",
                        tone === "flat" && "text-foreground",
                      )}
                    >
                      {deltaLabel(row.delta)}
                    </span>
                  );
                },
              },
              ...model.columns.map((col) => ({
                id: col.id,
                header: col.header,
                group: col.group,
                align: "right" as const,
                sortValue: (row: (typeof model.rows)[number]) => row.values[col.id],
                footer: countLabel(totals.statSums[col.id] ?? null),
                cell: (row: (typeof model.rows)[number]) => (
                  <span className="tnum font-semibold text-foreground">
                    {countLabel(row.values[col.id] ?? null)}
                  </span>
                ),
              })),
            ]}
          />
        </div>
      )}
    </section>
  );
}
