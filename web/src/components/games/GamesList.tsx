"use client";

import { useMemo, useState, type ReactNode } from "react";
import { GameDrawer } from "@/components/board/GameDrawer";
import { GameOutcome } from "@/components/board/GameOutcome";
import { NgsMute } from "@/components/board/NgsMute";
import { Matchup } from "@/components/board/TeamDot";
import { WeekScoreboard } from "@/components/board/WeekScoreboard";
import { DataTable } from "@/components/ui/DataTable";
import { sortBoardRows } from "@/lib/board-sort";
import { displayValue, homeLine, line } from "@/lib/edge";
import { kickoffLabel } from "@/lib/format";
import type { WeekScoreboard as WeekScoreboardData } from "@/lib/queries/results";
import { fallbackNotice, slateGameCountLabel } from "@/lib/slate";
import type { BoardRow, GameChecks, VerdictPayload } from "@/lib/types";
import type { DrawerPlayer } from "@/lib/queries/players";
import { cn } from "@/lib/utils";

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
  weekTotal,
  slateCount,
  verdicts = {},
  checks = {},
  playersByGame = {},
  scoreboard,
  toolbar,
  fallbackFrom,
  runCreatedAt,
}: {
  week?: number;
  rows?: BoardRow[];
  weekTotal?: number;
  slateCount?: number;
  verdicts?: Record<string, VerdictPayload>;
  checks?: Record<string, GameChecks>;
  playersByGame?: Record<string, DrawerPlayer[]>;
  scoreboard?: WeekScoreboardData;
  toolbar?: ReactNode;
  fallbackFrom?: string | null;
  runCreatedAt?: string | null;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const ordered = useMemo(() => sortBoardRows(rows), [rows]);
  const open = ordered.find((r) => r.game_id === openId) ?? null;
  const total = weekTotal ?? rows.length;
  const onSlate = slateCount ?? rows.length;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <h1 className="t-title">Games</h1>
        {toolbar}
        {fallbackFrom ? <p className="t-caption text-warn">{fallbackNotice(fallbackFrom)}</p> : null}
        <p className="t-caption">
          {week != null ? `Week ${week}. ` : ""}
          {total > 0 ? `${slateGameCountLabel(onSlate, total)} ` : ""}
          Sim score summary from the same draws as the Edge board. Click a row for the game drawer.
        </p>
      </header>
      {scoreboard ? <WeekScoreboard board={scoreboard} /> : null}
      <DataTable
        data={ordered}
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
        rowProps={(r) => ({
          className: cn("cursor-pointer", !r.has_started && "h-11"),
        })}
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
            id: "result",
            header: "Result",
            sortValue: (r) => (r.is_final ? 2 : r.has_started ? 1 : 0),
            cell: (r) =>
              r.has_started ? <GameOutcome row={r} compact /> : <span className="t-caption">—</span>,
          },
          {
            id: "sim",
            header: "Sim score",
            align: "right",
            sortValue: (r) => simScore(r)?.home ?? null,
            cell: (r) => {
              const sc = simScore(r);
              return (
                <span className="flex flex-col items-end gap-0.5">
                  <span className="tnum font-semibold text-foreground">
                    {sc ? `${sc.away.toFixed(1)}–${sc.home.toFixed(1)}` : "—"}
                  </span>
                  <NgsMute away={r.ngs_away_pts} home={r.ngs_home_pts} pWin={r.ngs_p_home_win} />
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
            id: "mspread",
            header: "Market spread",
            align: "right",
            sortValue: (r) => r.spread_line,
            cell: (r) => (
              <span className="tnum font-semibold text-foreground">
                {r.spread_line == null ? "—" : line(homeLine(r.spread_line))}
              </span>
            ),
          },
          {
            id: "total",
            header: "Fair total",
            align: "right",
            sortValue: (r) => displayValue(r.mean_total, r.fair_total),
            cell: (r) => {
              const tot = displayValue(r.mean_total, r.fair_total);
              return (
                <span className="tnum font-semibold text-foreground">{tot == null ? "—" : tot.toFixed(1)}</span>
              );
            },
          },
          {
            id: "mtotal",
            header: "Market total",
            align: "right",
            sortValue: (r) => r.total_line,
            cell: (r) => (
              <span className="tnum font-semibold text-foreground">
                {r.total_line == null ? "—" : r.total_line.toFixed(1)}
              </span>
            ),
          },
        ]}
      />
      <GameDrawer
        row={open}
        verdict={open ? (verdicts[open.game_id] ?? null) : null}
        checks={open ? (checks[open.game_id] ?? null) : null}
        players={open ? (playersByGame[open.game_id] ?? []) : []}
        runCreatedAt={runCreatedAt}
        open={open != null}
        onOpenChange={(v) => {
          if (!v) setOpenId(null);
        }}
      />
    </div>
  );
}
