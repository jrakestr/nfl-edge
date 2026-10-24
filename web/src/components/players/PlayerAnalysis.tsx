"use client";

import { useMemo, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
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
    if (split === "all") return model.rows;
    const completed = model.rows.filter((r) => !r.upcoming && !r.dnp);
    if (split === "l5") {
      const keys = new Set(completed.slice(-5).map((r) => r.key));
      return model.rows.filter((r) => keys.has(r.key));
    }
    if (split === "l3") {
      const keys = new Set(completed.slice(-3).map((r) => r.key));
      return model.rows.filter((r) => keys.has(r.key));
    }
    if (split === "home") return model.rows.filter((r) => r.homeAway === "home");
    if (split === "away") return model.rows.filter((r) => r.homeAway === "away");
    return model.rows;
  }, [model.rows, split]);

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
                      <span className="t-caption tnum">{row.scoreLabel}</span>
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
