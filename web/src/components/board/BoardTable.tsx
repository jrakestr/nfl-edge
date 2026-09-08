"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { displayValue, homeLine, maxEdge, pct } from "@/lib/edge";
import { kickoffLabel } from "@/lib/format";
import { slot as kickoffSlot } from "@/lib/teams";
import type { BoardRow, GameChecks, VerdictPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckStatus } from "./CheckStatus";
import { EdgeCell } from "./EdgeCell";
import { GameDrawer } from "./GameDrawer";
import { MarketPill } from "./MarketPill";
import { Matchup } from "./TeamDot";
import { type Filters, applyFilters } from "./filters";

/**
 * Dense table, one row per game (44px), sorted by |max edge| desc. Row click / Enter opens the
 * drawer; j/k move the cursor. Filters come from the URL via <BoardFilters>.
 */
export function BoardTable({
  rows,
  checks,
  verdicts,
  draws,
  filters,
  initialOpen,
}: {
  rows: BoardRow[];
  checks: Record<string, GameChecks>;
  verdicts: Record<string, VerdictPayload>;
  draws: number | null;
  filters: Filters;
  initialOpen?: string | null;
}) {
  const visible = useMemo(
    () => applyFilters(rows, filters, (r) => kickoffSlot(r.gameday, r.gametime)),
    [rows, filters],
  );
  const [cursor, setCursor] = useState<number>(-1);
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);

  const openRow = useCallback((id: string | null) => setOpenId(id), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (openId) return; // the Sheet owns Esc; ignore j/k while it is open
      if (e.key === "j") setCursor((c) => Math.min(visible.length - 1, c + 1));
      else if (e.key === "k") setCursor((c) => Math.max(0, c - 1));
      else if (e.key === "Enter" && cursor >= 0 && visible[cursor]) openRow(visible[cursor].game_id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, cursor, openId, openRow]);

  const openRowData = openId ? rows.find((r) => r.game_id === openId) ?? null : null;

  return (
    <section className="card overflow-x-auto" aria-label="Edge table">
      <div className="flex items-center justify-between border-b border-border-soft px-3 py-2">
        <span className="t-caption">
          Each cell: <span className="text-foreground font-semibold">model</span> · <span className="text-line font-semibold">book</span> ·{" "}
          <span className="text-edge-pos font-semibold">gap</span>. Green favors the home side / the over; red the away side / the under.
        </span>
        <span className="t-caption">
          {visible.length} of {rows.length} games · j/k rows · Enter opens
        </span>
      </div>
      <Table>
        <TableHeader className="bg-muted">
          <TableRow className="hover:bg-transparent">
            <Th>Matchup</Th>
            <Th className="text-right">Spread</Th>
            <Th className="text-right">Total</Th>
            <Th className="text-right">Home wins</Th>
            <Th className="text-right">Covers the book line</Th>
            <Th>Market</Th>
            <Th className="text-right">Checks</Th>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-11 text-center text-muted-foreground">
                No games match the filters.
              </TableCell>
            </TableRow>
          ) : null}
          {visible.map((r, i) => {
            const c = checks[r.game_id];
            const failed = c?.status === "fail";
            const modelSpread = displayValue(r.mean_spread, r.fair_spread);
            const modelTotal = displayValue(r.mean_total, r.fair_total);
            const e = r.edges;
            return (
              <TableRow
                key={r.game_id}
                tabIndex={0}
                data-game={r.game_id}
                data-max-edge={maxEdge(r).toFixed(4)}
                aria-selected={cursor === i || undefined}
                onClick={() => openRow(r.game_id)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter") openRow(r.game_id);
                }}
                className={cn(
                  "h-11 cursor-pointer border-border-soft hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
                  cursor === i && "bg-accent",
                )}
              >
                <TableCell className="t-body">
                  <div className="flex items-center gap-3">
                    <Matchup home={r.home} away={r.away} />
                    <span className="t-caption">{kickoffLabel(r.gameday, r.gametime)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {failed ? (
                    <Withheld />
                  ) : (
                    <EdgeCell
                      kind="spread"
                      model={modelSpread != null ? homeLine(modelSpread) : null}
                      market={r.spread_line != null ? homeLine(r.spread_line) : null}
                      edge={e.spread_home?.edge}
                      title={tip(`${r.home} covers`, r.p_home_cover_market, draws)}
                    />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {failed ? (
                    <Withheld />
                  ) : (
                    <EdgeCell
                      kind="total"
                      model={modelTotal}
                      market={r.total_line}
                      edge={e.total_over?.edge}
                      title={tip("Over", r.p_over_market, draws)}
                    />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {failed ? (
                    <Withheld />
                  ) : (
                    <EdgeCell
                      kind="prob"
                      model={e.ml_home?.model_prob ?? r.home_win_prob}
                      market={e.ml_home?.market_prob}
                      edge={e.ml_home?.edge}
                      title={tip(`${r.home} wins`, r.home_win_prob, draws)}
                    />
                  )}
                </TableCell>
                <TableCell className="tnum text-right text-muted-foreground">
                  {failed || r.p_home_cover_market == null ? (
                    "—"
                  ) : (
                    <span>
                      <span className="font-semibold text-foreground">{r.home}</span>{" "}
                      <span className="font-semibold text-foreground">{pct(r.p_home_cover_market)}</span>
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <MarketPill
                    home={r.home}
                    away={r.away}
                    spreadLine={r.spread_line}
                    homeSpreadOdds={r.home_spread_odds}
                    awaySpreadOdds={r.away_spread_odds}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <CheckStatus status={c?.status ?? "ok"} failed={c?.failed ?? []} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <GameDrawer
        row={openRowData}
        verdict={openId ? verdicts[openId] ?? null : null}
        checks={openId ? checks[openId] ?? null : null}
        open={openId != null}
        onOpenChange={(o) => {
          if (!o) openRow(null);
        }}
      />
    </section>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <TableHead className={cn("t-colhead h-9 text-muted-foreground", className)}>{children}</TableHead>;
}

function Withheld() {
  return <span className="t-caption text-edge-neg">withheld</span>;
}

function tip(what: string, p: number | null, draws: number | null): string {
  if (p == null) return what;
  return `${what} in ${pct(p)} of ${draws ? draws.toLocaleString("en-US") : "the"} simulated games`;
}
