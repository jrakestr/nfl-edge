"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { direction, intensity, pct, price, signedPct } from "@/lib/edge";
import { kickoffLabel } from "@/lib/format";
import type { BoardRow, GameChecks, VerdictPayload } from "@/lib/types";
import { CheckStatus } from "./CheckStatus";
import { EdgeDiff } from "./EdgeCell";
import { MarketPill, TotalPill } from "./MarketPill";
import { Matchup } from "./TeamDot";
import { emphasize } from "./emphasize";

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
  open,
  onOpenChange,
}: {
  row: BoardRow | null;
  verdict: VerdictPayload | null;
  checks: GameChecks | null;
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
                {verdict ? (
                  verdict.sentences.map((s, i) => <p key={i}>{emphasize(s)}</p>)
                ) : (
                  <p className="text-muted-foreground">No verdict at the newest line yet.</p>
                )}
              </section>

              <section aria-label="Edges">
                <h4 className="t-colhead mb-2 text-muted-foreground">Model vs market at the newest line</h4>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="t-colhead h-8 px-2">Side</TableHead>
                      <TableHead className="t-colhead h-8 px-2 text-right">Model</TableHead>
                      <TableHead className="t-colhead h-8 px-2 text-right">Market</TableHead>
                      <TableHead className="t-colhead h-8 px-2 text-right">Edge</TableHead>
                      <TableHead className="t-colhead h-8 px-2 text-right">Price</TableHead>
                      <TableHead className="t-colhead h-8 px-2 text-right">¼ Kelly</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(Object.keys(SIDE_LABEL) as (keyof BoardRow["edges"])[]).map((k) => {
                      const e = row.edges[k];
                      return (
                        <TableRow key={k} className="h-10">
                          <TableCell className="t-body px-2">{SIDE_LABEL[k](row)}</TableCell>
                          <TableCell className="tnum px-2 text-right font-semibold">{e ? pct(e.model_prob) : "—"}</TableCell>
                          <TableCell className="tnum px-2 text-right font-semibold text-line">
                            {e ? pct(e.market_prob) : "—"}
                          </TableCell>
                          <TableCell className="px-2 text-right">
                            {e ? (
                              <EdgeDiff dir={direction(e.edge)} inten={intensity(e.edge)}>
                                {signedPct(e.edge)}
                              </EdgeDiff>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="tnum px-2 text-right text-muted-foreground">{e ? price(e.price) : "—"}</TableCell>
                          <TableCell className="tnum px-2 text-right text-muted-foreground">
                            {e ? `${(e.kelly_fraction * 100).toFixed(1)}%` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </section>

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

              <section aria-label="Coming with the draws API" className="flex flex-col gap-2">
                {["Score distribution", "Fair vs market history", "Top-10 player projections", "Correlation strip"].map(
                  (t) => (
                    <div
                      key={t}
                      className="flex h-12 items-center justify-between rounded-md border border-dashed border-border px-3"
                    >
                      <span className="t-body text-muted-foreground">{t}</span>
                      <span className="t-caption">coming with the draws API</span>
                    </div>
                  ),
                )}
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
