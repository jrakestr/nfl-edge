"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { price } from "@/lib/edge";
import { kickoffLabel } from "@/lib/format";
import type { DrawerPlayer } from "@/lib/queries/players";
import type { TeamInput } from "@/lib/team-input";
import type { BoardRow, GameChecks, GameDetail, VerdictPayload } from "@/lib/types";
import { CheckStatus } from "./CheckStatus";
import { ChecksSection } from "./ChecksSection";
import { CorrelationStrip } from "./CorrelationStrip";
import { EdgesTable } from "./EdgesTable";
import { GameOutcome } from "./GameOutcome";
import { GameWhy } from "./GameWhy";
import { LineHistory } from "./LineHistory";
import { MarketPill, TotalPill } from "./MarketPill";
import { PlayerProjections } from "./PlayerProjections";
import { ScoreDistribution } from "./ScoreDistribution";
import { Matchup } from "./TeamDot";
import { WhyExplain } from "./WhyExplain";
import { emphasize } from "./emphasize";

export interface GameDrawerProps {
  row: BoardRow | null;
  verdict: VerdictPayload | null;
  checks: GameChecks | null;
  players?: DrawerPlayer[];
  detail?: GameDetail | null;
  runCreatedAt?: string | null;
  runId?: string | null;
  teamInputs?: Record<string, TeamInput>;
  scheduleOnly?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Row-click drawer: verdict sentences, six-side edges, team/QB priors, why-the-number
 * synthesis, margin + total score distributions from `model.proj_games.line_grid`,
 * reference-book line history vs our fair line, top-8 within-game DK correlations,
 * top-10 player projections, and run checks.
 */
export function GameDrawer({
  row,
  verdict,
  checks,
  players = [],
  detail = null,
  runCreatedAt,
  runId,
  teamInputs = {},
  scheduleOnly = false,
  open,
  onOpenChange,
}: GameDrawerProps) {
  const showOutcome = row != null && row.has_started;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="center" className="gap-0 overflow-hidden p-0">
        {row ? (
          <>
            <SheetHeader className="shrink-0 border-b border-border-soft p-6 pb-4">
              <SheetTitle className="t-title flex items-center gap-3">
                <Matchup home={row.home} away={row.away} variant="logo" />
              </SheetTitle>
              <div className="t-caption flex flex-wrap items-center gap-2">
                <SheetDescription className="t-caption">
                  {kickoffLabel(row.gameday, row.gametime)} ET
                </SheetDescription>
                <MarketPill
                  home={row.home}
                  away={row.away}
                  spreadLine={row.spread_line}
                  homeSpreadOdds={row.home_spread_odds}
                  awaySpreadOdds={row.away_spread_odds}
                />
                <TotalPill totalLine={row.total_line} />
                {row.away_moneyline != null || row.home_moneyline != null ? (
                  <span className="tnum t-body font-semibold text-line">
                    {row.away} {price(row.away_moneyline)} {row.home} {price(row.home_moneyline)}
                  </span>
                ) : null}
                {checks ? <CheckStatus status={checks.status} failed={checks.failed} showLabel /> : null}
              </div>
            </SheetHeader>

            <div className="min-h-0 flex-1 overflow-y-auto p-6">
              {scheduleOnly ? (
                showOutcome ? <GameOutcome row={row} /> : null
              ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
                  <div className="flex flex-col gap-6 lg:col-span-7">
                    <section aria-label="Verdict" className="flex flex-col gap-1 t-sentence">
                      {showOutcome ? (
                        <GameOutcome row={row} />
                      ) : verdict ? (
                        verdict.sentences.map((s, i) => <p key={i}>{emphasize(s)}</p>)
                      ) : (
                        <p className="text-muted-foreground">No verdict at the newest line yet.</p>
                      )}
                    </section>

                    {!showOutcome ? <EdgesTable row={row} /> : null}

                    <GameWhy row={row} runCreatedAt={runCreatedAt} inputs={teamInputs} />
                  </div>

                  <div className="flex flex-col gap-6 lg:col-span-5">
                    <WhyExplain runId={runId} gameId={row.game_id} open={open} />
                    <ScoreDistribution grid={detail?.grid ?? null} row={row} />
                    <LineHistory history={detail?.lineHistory ?? []} row={row} />
                    <CorrelationStrip correlations={detail?.correlations ?? []} />
                    <PlayerProjections players={players} />
                    <ChecksSection checks={checks} row={row} runCreatedAt={runCreatedAt} />
                  </div>
                </div>
              )}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
