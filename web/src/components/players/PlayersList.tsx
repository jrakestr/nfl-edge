"use client";

import Link from "next/link";
import { PositionPill } from "@/components/ui/PositionPill";
import { DataTable } from "@/components/ui/DataTable";
import type { WeekPlayer } from "@/lib/types";

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
            cell: (p) => (
              <span className="tnum font-semibold text-foreground">
                {p.fpts_dk_mean != null ? p.fpts_dk_mean.toFixed(1) : "—"}
              </span>
            ),
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
