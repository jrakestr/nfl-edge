"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable } from "@/components/ui/DataTable";
import { displayValue, homeLine, maxEdge, pct } from "@/lib/edge";
import { sortBoardRows } from "@/lib/board-sort";
import { kickoffLabel } from "@/lib/format";
import { slot as kickoffSlot } from "@/lib/teams";
import type { DrawerPlayer } from "@/lib/queries/players";
import type { BoardRow, GameChecks, VerdictPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckStatus } from "./CheckStatus";
import { EdgeCell } from "./EdgeCell";
import { GameDrawer } from "./GameDrawer";
import { GameOutcome } from "./GameOutcome";
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
  playersByGame = {},
}: {
  rows: BoardRow[];
  checks: Record<string, GameChecks>;
  verdicts: Record<string, VerdictPayload>;
  draws: number | null;
  filters: Filters;
  initialOpen?: string | null;
  playersByGame?: Record<string, DrawerPlayer[]>;
}) {
  const visible = useMemo(() => {
    const next = applyFilters(rows, filters, (r) => kickoffSlot(r.gameday, r.gametime));
    return sortBoardRows(next);
  }, [rows, filters]);
  const [cursor, setCursor] = useState<number>(-1);
  const [openId, setOpenId] = useState<string | null>(initialOpen ?? null);

  const openRow = useCallback((id: string | null) => setOpenId(id), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (openId) return;
      if (e.key === "j") setCursor((c) => Math.min(visible.length - 1, c + 1));
      else if (e.key === "k") setCursor((c) => Math.max(0, c - 1));
      else if (e.key === "Enter" && cursor >= 0 && visible[cursor]) openRow(visible[cursor].game_id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, cursor, openId, openRow]);

  const openRowData = openId ? (rows.find((r) => r.game_id === openId) ?? null) : null;

  return (
    <>
      <DataTable
        data={visible}
        getRowId={(r) => r.game_id}
        empty="No games match the filters."
        ariaLabel="Edge table"
        onRowClick={(r) => openRow(r.game_id)}
        toolbar={
          <div className="flex items-center justify-between border-b border-border-soft px-3 py-2">
            <span className="t-caption">
              Each cell: <span className="text-foreground font-semibold">model</span> ·{" "}
              <span className="text-line font-semibold">book</span> ·{" "}
              <span className="text-edge-pos font-semibold">gap</span>. Green favors the home side / the over; red the
              away side / the under.
            </span>
            <span className="t-caption">
              {visible.length} of {rows.length} games · j/k rows · Enter opens
            </span>
          </div>
        }
        rowProps={(r, i) => ({
          tabIndex: 0,
          "data-game": r.game_id,
          "data-max-edge": maxEdge(r).toFixed(4),
          "aria-selected": cursor === i || undefined,
          onKeyDown: (ev) => {
            if (ev.key === "Enter") openRow(r.game_id);
          },
          className: cn(
            r.has_started ? "cursor-pointer border-border-soft hover:bg-accent focus-visible:bg-accent focus-visible:outline-none" : "h-11 cursor-pointer border-border-soft hover:bg-accent focus-visible:bg-accent focus-visible:outline-none",
            cursor === i && "bg-accent",
          ),
        })}
        columns={[
          {
            id: "matchup",
            header: "Matchup",
            sortValue: (r) => `${r.away} ${r.home}`,
            cell: (r) => (
              <div className="flex items-center gap-3">
                <Matchup home={r.home} away={r.away} />
                <span className="t-caption">{kickoffLabel(r.gameday, r.gametime)}</span>
              </div>
            ),
          },
          {
            id: "spread",
            header: "Spread",
            align: "right",
            sortValue: (r) => r.edges.spread_home?.edge ?? maxEdge(r),
            cell: (r) => {
              const failed = checks[r.game_id]?.status === "fail";
              const modelSpread = displayValue(r.mean_spread, r.fair_spread);
              if (failed) return <Withheld />;
              if (r.has_started) return <GameOutcome row={r} compact />;
              return (
                <EdgeCell
                  kind="spread"
                  model={modelSpread != null ? homeLine(modelSpread) : null}
                  market={r.spread_line != null ? homeLine(r.spread_line) : null}
                  edge={r.edges.spread_home?.edge}
                  title={tip(`${r.home} covers`, r.p_home_cover_market, draws)}
                />
              );
            },
          },
          {
            id: "total",
            header: "Total",
            align: "right",
            sortValue: (r) => r.edges.total_over?.edge ?? null,
            cell: (r) => {
              const failed = checks[r.game_id]?.status === "fail";
              const modelTotal = displayValue(r.mean_total, r.fair_total);
              if (failed) return <Withheld />;
              if (r.has_started) return <span className="t-caption">—</span>;
              return (
                <EdgeCell
                  kind="total"
                  model={modelTotal}
                  market={r.total_line}
                  edge={r.edges.total_over?.edge}
                  title={tip("Over", r.p_over_market, draws)}
                />
              );
            },
          },
          {
            id: "ml",
            header: "Home wins",
            align: "right",
            sortValue: (r) => r.edges.ml_home?.edge ?? r.home_win_prob,
            cell: (r) => {
              const failed = checks[r.game_id]?.status === "fail";
              if (failed) return <Withheld />;
              if (r.has_started) return <span className="t-caption">—</span>;
              const e = r.edges;
              return (
                <EdgeCell
                  kind="prob"
                  model={e.ml_home?.model_prob ?? r.home_win_prob}
                  market={e.ml_home?.market_prob}
                  edge={e.ml_home?.edge}
                  title={tip(`${r.home} wins`, r.home_win_prob, draws)}
                />
              );
            },
          },
          {
            id: "cover",
            header: "Covers the book line",
            align: "right",
            sortValue: (r) => r.p_home_cover_market,
            cell: (r) => {
              const failed = checks[r.game_id]?.status === "fail";
              if (failed || r.has_started || r.p_home_cover_market == null) return "—";
              return (
                <span>
                  <span className="font-semibold text-foreground">{r.home}</span>{" "}
                  <span className="font-semibold text-foreground">{pct(r.p_home_cover_market)}</span>
                </span>
              );
            },
          },
          {
            id: "market",
            header: "Market",
            sortable: false,
            cell: (r) => (
              <MarketPill
                home={r.home}
                away={r.away}
                spreadLine={r.spread_line}
                homeSpreadOdds={r.home_spread_odds}
                awaySpreadOdds={r.away_spread_odds}
              />
            ),
          },
          {
            id: "checks",
            header: "Checks",
            align: "right",
            sortable: false,
            cell: (r) => {
              const c = checks[r.game_id];
              return <CheckStatus status={c?.status ?? "ok"} failed={c?.failed ?? []} />;
            },
          },
        ]}
      />
      <GameDrawer
        row={openRowData}
        verdict={openId ? (verdicts[openId] ?? null) : null}
        checks={openId ? (checks[openId] ?? null) : null}
        players={openId ? (playersByGame[openId] ?? []) : []}
        open={openId != null}
        onOpenChange={(o) => {
          if (!o) openRow(null);
        }}
      />
    </>
  );
}

function Withheld() {
  return <span className="t-caption text-edge-neg">withheld</span>;
}

function tip(what: string, p: number | null, draws: number | null): string {
  if (p == null) return what;
  return `${what} in ${pct(p)} of ${draws ? draws.toLocaleString("en-US") : "the"} simulated games`;
}
