"use client";

import { useState } from "react";
import { GameDrawer } from "@/components/board/GameDrawer";
import { Matchup } from "@/components/board/TeamDot";
import { DataTable } from "@/components/ui/DataTable";
import { displayValue, homeLine, line } from "@/lib/edge";
import { kickoffLabel } from "@/lib/format";
import type { BoardRow, GameChecks, VerdictPayload } from "@/lib/types";
import type { DrawerPlayer } from "@/lib/queries/players";

/** Implied scores from E[total] and E[home−away]. Mean when present, median otherwise. */
export function simScore(row: Pick<BoardRow, "mean_total" | "mean_spread" | "fair_total" | "fair_spread">): {
  away: number;
  home: number;
} | null {
  const total = displayValue(row.mean_total, row.fair_total);
  const spread = displayValue(row.mean_spread, row.fair_spread);
  if (total == null || spread == null) return null;
  return { home: (total + spread) / 2, away: (total - spread) / 2 };
}

export function GamesList({
  week,
  rows = [],
  verdicts = {},
  checks = {},
  playersByGame = {},
}: {
  week?: number;
  rows?: BoardRow[];
  verdicts?: Record<string, VerdictPayload>;
  checks?: Record<string, GameChecks>;
  playersByGame?: Record<string, DrawerPlayer[]>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((r) => r.game_id === openId) ?? null;
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="t-title">Games</h1>
        <p className="mt-1 t-caption">
          {week != null ? `Week ${week}. ` : ""}
          Sim score summary from the same draws as the Edge board. Click a row for the game drawer.
        </p>
      </header>
      <DataTable
        data={rows}
        getRowId={(r) => r.game_id}
        empty="No games listed yet"
        ariaLabel="Games"
        searchPlaceholder="Team"
        onRowClick={(r) => setOpenId(r.game_id)}
        filters={{
          search: (r, q) =>
            r.home.toLowerCase().includes(q) ||
            r.away.toLowerCase().includes(q) ||
            r.game_id.toLowerCase().includes(q),
        }}
        rowProps={() => ({ className: "h-11 cursor-pointer" })}
        columns={[
          {
            id: "matchup",
            header: "Matchup",
            sortValue: (r) => `${r.away} ${r.home}`,
            cell: (r) => <Matchup home={r.home} away={r.away} />,
          },
          {
            id: "kickoff",
            header: "Kickoff",
            sortValue: (r) => `${r.gameday ?? ""} ${r.gametime ?? ""}`,
            cell: (r) => <span className="t-caption">{kickoffLabel(r.gameday, r.gametime)}</span>,
          },
          {
            id: "sim",
            header: "Sim score",
            align: "right",
            sortValue: (r) => simScore(r)?.home ?? null,
            cell: (r) => {
              const sc = simScore(r);
              return (
                <span className="tnum font-semibold text-foreground">
                  {sc ? `${sc.away.toFixed(1)}–${sc.home.toFixed(1)}` : "—"}
                </span>
              );
            },
          },
          {
            id: "spread",
            header: "Fair spread",
            align: "right",
            sortValue: (r) => displayValue(r.mean_spread, r.fair_spread),
            cell: (r) => {
              const spread = displayValue(r.mean_spread, r.fair_spread);
              return (
                <span className="tnum font-semibold text-foreground">
                  {spread == null ? "—" : line(homeLine(spread))}
                </span>
              );
            },
          },
          {
            id: "total",
            header: "Fair total",
            align: "right",
            sortValue: (r) => displayValue(r.mean_total, r.fair_total),
            cell: (r) => {
              const total = displayValue(r.mean_total, r.fair_total);
              return (
                <span className="tnum font-semibold text-foreground">{total == null ? "—" : total.toFixed(1)}</span>
              );
            },
          },
        ]}
      />
      <GameDrawer
        row={open}
        verdict={open ? (verdicts[open.game_id] ?? null) : null}
        checks={open ? (checks[open.game_id] ?? null) : null}
        players={open ? (playersByGame[open.game_id] ?? []) : []}
        open={open != null}
        onOpenChange={(v) => {
          if (!v) setOpenId(null);
        }}
      />
    </div>
  );
}
