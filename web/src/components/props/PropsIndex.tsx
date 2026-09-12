"use client";

import Link from "next/link";
import { PositionPill } from "@/components/ui/PositionPill";
import { DataTable } from "@/components/ui/DataTable";
import { pct, signedPct } from "@/lib/edge";
import { STAT_LABELS } from "@/lib/prop-stats";
import type { PropEdge } from "@/lib/types";

function gameLabel(e: PropEdge): string {
  return e.away && e.home ? `${e.away} @ ${e.home}` : e.game_id ?? "—";
}

/** List-by-|edge|. Detail is /props/[game]/[player]. */
export function PropsIndex({ edges = [] }: { edges?: PropEdge[] }) {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="t-title">Props</h1>
        <p className="mt-1 t-caption">
          Sorted by |edge| or |floor|. One-sided prices show a conservative floor, not a de-vigged edge.
        </p>
      </header>
      <DataTable
        data={edges}
        getRowId={(e) => `${e.player_id}-${e.stat}`}
        empty="No prop edges yet"
        ariaLabel="Prop edges"
        searchPlaceholder="Name, team, or stat"
        defaultSort={{ id: "edge", dir: "desc" }}
        filters={{
          search: (e, q) =>
            e.player_name.toLowerCase().includes(q) ||
            (e.home ?? "").toLowerCase().includes(q) ||
            (e.away ?? "").toLowerCase().includes(q) ||
            (STAT_LABELS[e.stat] ?? e.stat).toLowerCase().includes(q),
          position: (e) => e.position,
          game: (e) => gameLabel(e),
        }}
        columns={[
          {
            id: "player",
            header: "Player",
            sortValue: (e) => e.player_name,
            cell: (e) => (
              <span className="inline-flex items-center gap-1.5">
                <PositionPill position={e.position} />
                <Link
                  href={`/props/${e.game_id ?? "unknown"}/${e.player_id}`}
                  className="font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  {e.player_name}
                </Link>
              </span>
            ),
          },
          {
            id: "game",
            header: "Game",
            sortValue: (e) => gameLabel(e),
            cell: (e) => <span className="t-body font-semibold text-foreground">{gameLabel(e)}</span>,
          },
          {
            id: "market",
            header: "Market",
            sortValue: (e) => e.stat,
            cell: (e) => <span className="t-caption">{STAT_LABELS[e.stat] ?? e.stat}</span>,
          },
          {
            id: "line",
            header: "Line",
            align: "right",
            sortValue: (e) => e.line,
            cell: (e) => <span className="tnum font-semibold text-foreground">{e.line}</span>,
          },
          {
            id: "pOver",
            header: "Chance of over",
            align: "right",
            sortValue: (e) => e.p_over,
            cell: (e) => <span className="tnum font-semibold text-foreground">{pct(e.p_over)}</span>,
          },
          {
            id: "edge",
            header: "Edge",
            metric: "edge",
            align: "right",
            sortValue: (e) => Math.abs((e.one_sided ? e.edge_floor : e.edge) ?? 0),
            cell: (e) =>
              e.one_sided ? (
                <span className="flex flex-col items-end">
                  <span className="tnum font-semibold text-foreground">{signedPct(e.edge_floor)}</span>
                  <span className="t-caption text-muted-foreground">one-sided price, conservative</span>
                </span>
              ) : (
                <span className="tnum font-semibold text-foreground">{signedPct(e.edge)}</span>
              ),
          },
        ]}
      />
    </div>
  );
}
