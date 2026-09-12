import type { TrackRecord } from "@/lib/queries/results";
import type { DrawerPlayer } from "@/lib/queries/players";
import type { BoardRow, GameChecks, VerdictRow } from "@/lib/types";
import { EmptyState } from "@/components/EmptyState";
import { BoardTable } from "./BoardTable";
import { type Filters } from "./filters";
import { type RunOption } from "./RunBadge";
import { SummaryTiles } from "./SummaryTiles";
import { VerdictCard } from "./VerdictCard";
import { WeekHeader, type View } from "./WeekHeader";
import { WeekSummaryCard } from "./WeekSummaryCard";
import { draws as fmtDraws, shortRun } from "@/lib/format";

export type WeekBoardProps = {
  season: number;
  week: number;
  weeks: number[];
  view: View;
  filters: Filters;
  run: RunOption | null;
  runs: RunOption[];
  stale: boolean;
  verdicts: VerdictRow[]; // sorted by max_edge desc, fail rows last
  rows: BoardRow[]; // sorted by |max edge| desc
  checks: Record<string, GameChecks>;
  track: TrackRecord;
  playersByGame?: Record<string, DrawerPlayer[]>;
};

/** The Edge board, pure over its props (the page loads them; the route test feeds a fixture). */
export function WeekBoard(p: WeekBoardProps) {
  const summary = p.verdicts.find((v) => v.payload.week_summary)?.payload.week_summary ?? null;
  const payloads = p.verdicts.map((v) => v.payload);
  const byGame = Object.fromEntries(p.verdicts.map((v) => [v.game_id, v.payload]));
  const missingVerdicts = p.rows.length - p.verdicts.length;

  const caption = p.run
    ? `Run ${shortRun(p.run.run_id)} · ${fmtDraws(p.run.draws_per_game)} draws per game · ${p.rows.length} games`
    : `No sim run for week ${p.week} yet`;

  return (
    <>
      <WeekHeader
        season={p.season}
        week={p.week}
        weeks={p.weeks}
        view={p.view}
        filters={p.filters}
        run={p.run}
        runs={p.runs}
        stale={p.stale}
      />

      {!p.run ? (
        <EmptyState title={`Week ${p.week}`}>
          No simulation for this week yet. Run `nfl-edge sim --season {p.season} --week {p.week}` and then `nfl-edge
          lines`.
        </EmptyState>
      ) : (
        <>
          <WeekSummaryCard summary={summary} caption={caption} />

          {missingVerdicts > 0 ? (
            <p className="t-caption text-warn" role="note">
              {missingVerdicts} of {p.rows.length} games have a newer line than their verdict.
            </p>
          ) : null}

          {p.view === "plain" ? (
            <div className="flex flex-col gap-3" data-view="plain">
              {p.verdicts.map((v) => (
                <VerdictCard
                  key={v.game_id}
                  payload={v.payload}
                  liveEdges={p.rows.find((r) => r.game_id === v.game_id)?.edges}
                  failedChecks={p.checks[v.game_id]?.failed ?? []}
                />
              ))}
              {p.verdicts.length === 0 ? (
                <EmptyState title="No verdicts">Nothing persisted for this run at the newest line.</EmptyState>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-col gap-4" data-view="table">
              <SummaryTiles payloads={payloads} track={p.track} />
              <BoardTable
                rows={p.rows}
                checks={p.checks}
                verdicts={byGame}
                draws={p.run.draws_per_game}
                filters={p.filters}
                playersByGame={p.playersByGame}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}
