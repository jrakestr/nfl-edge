"use client";

import { DataTable } from "@/components/ui/DataTable";
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
  const model = buildPlayerAnalysis({
    position,
    season,
    week,
    log,
    actuals,
    projections,
    simProjections,
  });

  return (
    <section className="card p-4" aria-label="Season game log">
      <h2 className="t-body font-semibold">Season game log</h2>
      <p className="mt-1 t-caption">
        {season} regular season · DraftKings points and{" "}
        {position ? `${position} counting stats` : "counting stats"} through Week {week}.
      </p>
      {model.empty ? (
        <p className="mt-3 t-body">{model.empty}</p>
      ) : (
        <div className="mt-3">
          <DataTable
            data={model.rows}
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
                  <span className="font-semibold text-foreground">{row.opponent ?? "—"}</span>
                ),
              },
              {
                id: "scored",
                header: "Scored DK",
                align: "right",
                sortValue: (row) => row.scored,
                cell: (row) => (
                  <span className="tnum font-semibold text-foreground">{scoredLabel(row)}</span>
                ),
              },
              {
                id: "sim",
                header: "Sim DK",
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
