"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DataTable } from "@/components/ui/DataTable";
import { direction, intensity, pct, price, signedPct } from "@/lib/edge";
import { kickoffLabel } from "@/lib/format";
import type { BoardRow, GameChecks, VerdictPayload } from "@/lib/types";
import type { DrawerPlayer } from "@/lib/queries/players";
import { CheckStatus } from "./CheckStatus";
import { EdgeDiff } from "./EdgeCell";
import { GameOutcome } from "./GameOutcome";
import { MarketPill, TotalPill } from "./MarketPill";
import { Matchup } from "./TeamDot";
import { emphasize } from "./emphasize";
import { PositionPill } from "@/components/ui/PositionPill";
import { MetricLabel } from "@/lib/icons";

const SIDE_LABEL: Record<keyof BoardRow["edges"], (r: BoardRow) => string> = {
  spread_home: (r) => `${r.home} spread`,
  spread_away: (r) => `${r.away} spread`,
  total_over: () => "Over",
  total_under: () => "Under",
  ml_home: (r) => `${r.home} moneyline`,
  ml_away: (r) => `${r.away} moneyline`,
};

/**
 * Row-click drawer, v1 content: the game's sentences, the six edge rows, the checks.
 * Score histogram, fair-vs-market history and player projections need the draws read path
 * (web-refine) and are labelled as such.
 */
export function GameDrawer({
  row,
  verdict,
  checks,
  players = [],
  open,
  onOpenChange,
}: {
  row: BoardRow | null;
  verdict: VerdictPayload | null;
  checks: GameChecks | null;
  players?: DrawerPlayer[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[520px] gap-0 overflow-y-auto p-0 sm:max-w-[520px]">
        {row ? (
          <>
            <SheetHeader className="border-b border-border-soft p-6 pb-4">
              <SheetTitle className="t-title flex items-center gap-3">
                <Matchup home={row.home} away={row.away} />
              </SheetTitle>
              <SheetDescription className="t-caption flex flex-wrap items-center gap-2">
                <span>{kickoffLabel(row.gameday, row.gametime)} ET</span>
                <MarketPill
                  home={row.home}
                  away={row.away}
                  spreadLine={row.spread_line}
                  homeSpreadOdds={row.home_spread_odds}
                  awaySpreadOdds={row.away_spread_odds}
                />
                <TotalPill totalLine={row.total_line} />
                {checks ? <CheckStatus status={checks.status} failed={checks.failed} showLabel /> : null}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-6 p-6">
              <section aria-label="Verdict" className="flex flex-col gap-1 t-sentence">
                {row.has_started ? (
                  <GameOutcome row={row} />
                ) : verdict ? (
                  verdict.sentences.map((s, i) => <p key={i}>{emphasize(s)}</p>)
                ) : (
                  <p className="text-muted-foreground">No verdict at the newest line yet.</p>
                )}
              </section>

              {row.has_started ? null : (
              <section aria-label="Edges">
                <h4 className="t-colhead mb-2 text-muted-foreground">Model vs market at the newest line</h4>
                <DataTable
                  data={(Object.keys(SIDE_LABEL) as (keyof BoardRow["edges"])[]).map((k) => ({
                    id: k,
                    label: SIDE_LABEL[k](row),
                    e: row.edges[k],
                  }))}
                  getRowId={(r) => r.id}
                  empty="—"
                  ariaLabel="Edges"
                  syncUrl={false}
                  defaultSort={{ id: "edge", dir: "desc" }}
                  rowProps={() => ({ className: "h-10" })}
                  columns={[
                    {
                      id: "side",
                      header: "Side",
                      sortValue: (r) => r.label,
                      cell: (r) => <span className="t-body">{r.label}</span>,
                    },
                    {
                      id: "model",
                      header: "Model",
                      align: "right",
                      sortValue: (r) => r.e?.model_prob,
                      cell: (r) => <span className="tnum font-semibold">{r.e ? pct(r.e.model_prob) : "—"}</span>,
                    },
                    {
                      id: "market",
                      header: "Market",
                      align: "right",
                      sortValue: (r) => r.e?.market_prob,
                      cell: (r) => (
                        <span className="tnum font-semibold text-line">{r.e ? pct(r.e.market_prob) : "—"}</span>
                      ),
                    },
                    {
                      id: "edge",
                      header: "Edge",
                      metric: "edge",
                      align: "right",
                      sortValue: (r) => r.e?.edge,
                      cell: (r) =>
                        r.e ? (
                          <EdgeDiff dir={direction(r.e.edge)} inten={intensity(r.e.edge)}>
                            {signedPct(r.e.edge)}
                          </EdgeDiff>
                        ) : (
                          "—"
                        ),
                    },
                    {
                      id: "price",
                      header: "Price",
                      align: "right",
                      sortValue: (r) => r.e?.price,
                      cell: (r) => (
                        <span className="tnum font-semibold text-foreground">{r.e ? price(r.e.price) : "—"}</span>
                      ),
                    },
                    {
                      id: "kelly",
                      header: "¼ Kelly",
                      align: "right",
                      sortValue: (r) => r.e?.kelly_fraction,
                      cell: (r) => (
                        <span className="tnum font-semibold text-foreground">
                          {r.e ? `${(r.e.kelly_fraction * 100).toFixed(1)}%` : "—"}
                        </span>
                      ),
                    },
                  ]}
                />
              </section>
              )}

              <section aria-label="Checks" className="flex flex-col gap-1">
                <h4 className="t-colhead text-muted-foreground">Checks</h4>
                {checks ? (
                  <p className="t-body text-muted-foreground">
                    {checks.invariants} invariant{checks.invariants === 1 ? "" : "s"}, {checks.warnings} warning
                    {checks.warnings === 1 ? "" : "s"}
                    {checks.failed.length ? ` · failed: ${checks.failed.join(", ")}` : " · all passed"}
                  </p>
                ) : (
                  <p className="t-body text-muted-foreground">No game-level checks recorded.</p>
                )}
              </section>

              <section aria-label="Top player projections" className="flex flex-col gap-2">
                <h4 className="t-colhead text-muted-foreground">
                  <MetricLabel metric="projection">Top-10 player projections</MetricLabel>
                </h4>
                {players.length === 0 ? (
                  <p className="t-caption">No player projections on this run.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {players.map((p) => (
                      <li key={p.display_name} className="flex items-center justify-between gap-2">
                        <span className="inline-flex min-w-0 items-center gap-1.5">
                          <PositionPill position={p.position} />
                          <span className="truncate font-semibold text-foreground">{p.display_name}</span>
                        </span>
                        <span className="tnum font-semibold text-foreground">
                          {p.fpts_dk_mean != null ? p.fpts_dk_mean.toFixed(1) : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section aria-label="Coming with the draws API" className="flex flex-col gap-2">
                {["Score distribution", "Fair vs market history", "Correlation strip"].map((t) => (
                  <div
                    key={t}
                    className="flex h-12 items-center justify-between rounded-md border border-dashed border-border px-3"
                  >
                    <span className="t-body text-muted-foreground">{t}</span>
                    <span className="t-caption">coming with the draws API</span>
                  </div>
                ))}
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
