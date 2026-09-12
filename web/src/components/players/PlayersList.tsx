"use client";

import Link from "next/link";
import { PositionPill } from "@/components/ui/PositionPill";
import { StatusPill } from "@/components/ui/StatusPill";
import { DataTable } from "@/components/ui/DataTable";
import { REBUILD_PENDING, inOptimizerPool, staleInjury } from "@/lib/injury-status";
import { cn } from "@/lib/utils";
import type { WeekPlayer } from "@/lib/types";

function rowFlags(p: WeekPlayer) {
  const stale = staleInjury(p.override_status, p.override_updated_at, p.run_created_at);
  const inPool = inOptimizerPool(p.override_status, p.override_updated_at, p.run_created_at);
  return { stale, inPool };
}

/** Search → prop detail. Rows from model.proj_players. */
export function PlayersList({ players = [] }: { players?: WeekPlayer[] }) {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="t-title">Players</h1>
      </header>
      <DataTable
        data={players}
        getRowId={(p) => p.player_id}
        empty="No projections listed yet"
        ariaLabel="Players"
        rowProps={(p) => ({ "data-in-pool": String(rowFlags(p).inPool) })}
        searchPlaceholder="Name or team"
        filters={{
          search: (p, q) =>
            p.display_name.toLowerCase().includes(q) ||
            (p.team ?? "").toLowerCase().includes(q) ||
            (p.position ?? "").toLowerCase().includes(q),
          position: (p) => p.position,
          team: (p) => p.team,
          minProj: (p) => p.fpts_dk_mean,
        }}
        columns={[
          {
            id: "player",
            header: "Player",
            sortValue: (p) => p.display_name,
            cell: (p) => (
              <span className="inline-flex items-center gap-1.5">
                <PositionPill position={p.position} />
                <StatusPill status={p.override_status} />
                <Link
                  href={`/props/${p.game_id ?? "unknown"}/${p.player_id}`}
                  className="font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  {p.display_name}
                </Link>
              </span>
            ),
          },
          {
            id: "team",
            header: "Team",
            sortValue: (p) => p.team ?? "",
            cell: (p) => <span className="t-body font-semibold text-foreground">{p.team ?? "—"}</span>,
          },
          {
            id: "proj",
            header: "DK pts",
            metric: "projection",
            align: "right",
            sortValue: (p) => p.fpts_dk_mean,
            cell: (p) => {
              const { stale } = rowFlags(p);
              return (
                <span className="flex flex-col items-end gap-0.5">
                  <span
                    className={cn(
                      "tnum font-semibold",
                      stale ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {p.fpts_dk_mean != null ? p.fpts_dk_mean.toFixed(1) : "—"}
                  </span>
                  {stale ? <span className="t-caption text-warn">{REBUILD_PENDING}</span> : null}
                </span>
              );
            },
          },
          {
            id: "typical",
            header: "Typical game",
            align: "right",
            sortValue: (p) => p.typical_dk,
            cell: (p) => (
              <span className="tnum font-semibold text-foreground">
                {p.typical_dk != null ? p.typical_dk.toFixed(1) : "—"}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
