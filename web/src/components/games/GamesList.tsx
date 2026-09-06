"use client";

import { useState } from "react";
import { GameDrawer } from "@/components/board/GameDrawer";
import { Matchup } from "@/components/board/TeamDot";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { displayValue, homeLine, line } from "@/lib/edge";
import { kickoffLabel } from "@/lib/format";
import type { BoardRow, GameChecks, VerdictPayload } from "@/lib/types";

const COLS = ["Matchup", "Kickoff", "Sim score", "Fair spread", "Fair total"] as const;

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
}: {
  week?: number;
  rows?: BoardRow[];
  verdicts?: Record<string, VerdictPayload>;
  checks?: Record<string, GameChecks>;
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
      <section className="card overflow-x-auto" aria-label="Games">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow className="hover:bg-transparent">
              {COLS.map((c) => (
                <TableHead key={c} className="t-colhead text-dim">
                  {c}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLS.length} className="py-6 text-center t-caption">
                  No games listed yet
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const sc = simScore(r);
                const spread = displayValue(r.mean_spread, r.fair_spread);
                const total = displayValue(r.mean_total, r.fair_total);
                return (
                  <TableRow
                    key={r.game_id}
                    className="h-11 cursor-pointer"
                    onClick={() => setOpenId(r.game_id)}
                  >
                    <TableCell>
                      <Matchup home={r.home} away={r.away} />
                    </TableCell>
                    <TableCell className="t-caption">{kickoffLabel(r.gameday, r.gametime)}</TableCell>
                    <TableCell className="tnum">
                      {sc ? `${sc.away.toFixed(1)}–${sc.home.toFixed(1)}` : "—"}
                    </TableCell>
                    <TableCell className="tnum">{spread == null ? "—" : line(homeLine(spread))}</TableCell>
                    <TableCell className="tnum">{total == null ? "—" : total.toFixed(1)}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </section>
      <GameDrawer
        row={open}
        verdict={open ? (verdicts[open.game_id] ?? null) : null}
        checks={open ? (checks[open.game_id] ?? null) : null}
        open={open != null}
        onOpenChange={(v) => {
          if (!v) setOpenId(null);
        }}
      />
    </div>
  );
}
