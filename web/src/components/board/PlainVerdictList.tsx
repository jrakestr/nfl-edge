"use client";

import { useState } from "react";
import { direction, intensity, signedPct } from "@/lib/edge";
import type { BoardRow, Chip, VerdictPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckStatus } from "./CheckStatus";
import { EdgeDiff } from "./EdgeCell";
import { OpenGameTrigger } from "./OpenGameTrigger";
import { Matchup } from "./TeamDot";
import { useGameOpen } from "./useGameOpen";
import { VerdictCard } from "./VerdictCard";

export type Density = "full" | "compact";

export type PlainItem = {
  payload: VerdictPayload;
  row?: BoardRow;
  liveEdges?: BoardRow["edges"];
  failedChecks: string[];
  gapCaptions: string[];
};

function mlEdge(payload: VerdictPayload, live?: BoardRow["edges"]): number | null {
  const home = live?.ml_home?.edge ?? payload.edges.find((e) => e.market_type === "moneyline" && e.side === "home")?.edge;
  const away = live?.ml_away?.edge ?? payload.edges.find((e) => e.market_type === "moneyline" && e.side === "away")?.edge;
  if (home == null && away == null) return payload.chips?.home_wins?.edge ?? null;
  if (home == null) return away ?? null;
  if (away == null) return home;
  return away > home ? away : home;
}

function EdgeTiny({ edge }: { edge: number | null | undefined }) {
  if (edge == null) return <span className="tnum t-body text-foreground">—</span>;
  return (
    <EdgeDiff dir={direction(edge)} inten={intensity(edge)} className="t-body">
      {signedPct(edge)}
    </EdgeDiff>
  );
}

export function PlainVerdictList({ items, density }: { items: PlainItem[]; density: Density }) {
  const open = useGameOpen();
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  if (density !== "compact") {
    return (
      <div className="flex flex-col gap-3" data-view="plain" data-density="full">
        {items.map((it) => (
          <OpenGameTrigger key={it.payload.game_id} gameId={it.payload.game_id}>
            <VerdictCard
              payload={it.payload}
              row={it.row}
              liveEdges={it.liveEdges}
              failedChecks={it.failedChecks}
              gapCaptions={it.gapCaptions}
            />
          </OpenGameTrigger>
        ))}
      </div>
    );
  }

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="card overflow-hidden" data-view="plain" data-density="compact">
      <div className="grid grid-cols-[minmax(7rem,1fr)_5.5rem_5.5rem_5.5rem_1.5rem] items-center gap-3 border-b border-border-soft px-4 py-2">
        <span className="t-colhead text-muted-foreground">Matchup</span>
        <span className="t-colhead text-muted-foreground">Spread</span>
        <span className="t-colhead text-muted-foreground">Total</span>
        <span className="t-colhead text-muted-foreground">ML</span>
        <span className="t-colhead text-muted-foreground sr-only">Status</span>
      </div>
      {items.map((it) => {
        const id = it.payload.game_id;
        const openRow = expanded.has(id);
        const chips = it.payload.chips;
        const started = Boolean(it.row?.has_started);
        const side: Chip | null | undefined = started ? null : chips?.side;
        const total: Chip | null | undefined = started ? null : chips?.total;
        return (
          <div key={id} className="border-t border-border-soft first:border-t-0" data-game={id}>
            <button
              type="button"
              aria-expanded={openRow}
              onClick={() => toggle(id)}
              className="grid h-12 w-full grid-cols-[minmax(7rem,1fr)_5.5rem_5.5rem_5.5rem_1.5rem] items-center gap-3 px-4 text-left hover:bg-accent"
            >
              <Matchup home={it.payload.home} away={it.payload.away} variant="logo" />
              <EdgeTiny edge={side?.edge} />
              <EdgeTiny edge={total?.edge} />
              <EdgeTiny edge={started ? null : mlEdge(it.payload, it.liveEdges)} />
              <CheckStatus status={it.payload.status} failed={it.failedChecks} />
            </button>
            <div
              className={cn(
                "grid motion-safe:transition-[grid-template-rows] motion-safe:duration-[var(--dur-2)] motion-safe:ease-[var(--ease-app)]",
                openRow ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">
                <div
                  className={cn(
                    "px-3 pb-3 motion-safe:transition-opacity motion-safe:duration-[var(--dur-2)] motion-safe:ease-[var(--ease-app)]",
                    openRow ? "opacity-100" : "opacity-0",
                  )}
                >
                  <VerdictCard
                    payload={it.payload}
                    row={it.row}
                    liveEdges={it.liveEdges}
                    failedChecks={it.failedChecks}
                    gapCaptions={it.gapCaptions}
                    onOpen={open}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
