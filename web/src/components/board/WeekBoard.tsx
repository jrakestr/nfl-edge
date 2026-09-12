import type { TrackRecord, WeekScoreboard as WeekScoreboardData } from "@/lib/queries/results";
import type { DrawerPlayer } from "@/lib/queries/players";
import type { BoardRow, GameChecks, VerdictRow } from "@/lib/types";
import { EmptyState } from "@/components/EmptyState";
import { BoardTable } from "./BoardTable";
import { type Filters } from "./filters";
import { type RunOption } from "./RunBadge";
import { SummaryTiles } from "./SummaryTiles";
import { VerdictCard } from "./VerdictCard";
import { WeekHeader, type View } from "./WeekHeader";
import { WeekScoreboard } from "./WeekScoreboard";
import { WeekSummaryCard } from "./WeekSummaryCard";
import { draws as fmtDraws, maxIso, shortRun } from "@/lib/format";

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
  scoreboard: WeekScoreboardData;
  playersByGame?: Record<string, DrawerPlayer[]>;
};

/** The Edge board, pure over its props (the page loads them; the route test feeds a fixture). */
export function WeekBoard(p: WeekBoardProps) {
  const rowOf = Object.fromEntries(p.rows.map((r) => [r.game_id, r]));
  const rank = (id: string) => {
    const r = rowOf[id];
    if (!r) return 0;
    if (r.is_final) return 2;
    if (r.has_started) return 1;
    return 0;
  };
  const verdicts = [...p.verdicts].sort((a, b) => {
    const d = rank(a.game_id) - rank(b.game_id);
    if (d !== 0) return d;
    const fa = a.payload.status === "fail" ? 1 : 0;
    const fb = b.payload.status === "fail" ? 1 : 0;
    if (fa !== fb) return fa - fb;
    const ra = rowOf[a.game_id];
    const rb = rowOf[b.game_id];
    if (ra && (ra.is_final || ra.has_started)) {
      return `${ra.gameday} ${ra.gametime ?? ""}`.localeCompare(`${rb?.gameday ?? ""} ${rb?.gametime ?? ""}`);
    }
    return b.payload.max_edge - a.payload.max_edge;
  });
  const remainingRows = p.rows.filter((r) => !r.has_started);
  const remainingIds = new Set(remainingRows.map((r) => r.game_id));
  const remainingVerdicts = verdicts.filter((v) => remainingIds.has(v.game_id));
  const summary = verdicts.find((v) => v.payload.week_summary)?.payload.week_summary ?? null;
  const payloads = remainingVerdicts.map((v) => v.payload);
  const byGame = Object.fromEntries(verdicts.map((v) => [v.game_id, v.payload]));
  const verdictIds = new Set(verdicts.map((v) => v.game_id));
  const missingVerdicts = remainingRows.filter((r) => !verdictIds.has(r.game_id)).length;
  const linesAsOf = maxIso(p.rows.map((r) => r.captured_at));
  const verdictsAsOf = maxIso(p.verdicts.map((v) => v.payload.market?.captured_at));

  const caption = p.run
    ? `Run ${shortRun(p.run.run_id)} · ${fmtDraws(p.run.draws_per_game)} draws per game · ${remainingRows.length} games`
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
        linesAsOf={linesAsOf}
        verdictsAsOf={verdictsAsOf}
      />

      {!p.run ? (
        <EmptyState title={`Week ${p.week}`}>
          No simulation for this week yet. Run `nfl-edge sim --season {p.season} --week {p.week}` and then `nfl-edge
          lines`.
        </EmptyState>
      ) : (
        <>
          <WeekScoreboard board={p.scoreboard} />
          <WeekSummaryCard summary={summary} caption={caption} />

          {missingVerdicts > 0 ? (
            <p className="t-caption text-warn" role="note">
              {missingVerdicts} of {remainingRows.length} games have a newer line than their verdict.
            </p>
          ) : null}

          {p.view === "plain" ? (
            <div className="flex flex-col gap-3" data-view="plain">
              {verdicts.map((v) => {
                const row = p.rows.find((r) => r.game_id === v.game_id);
                return (
                  <VerdictCard
                    key={v.game_id}
                    payload={v.payload}
                    row={row}
                    liveEdges={row?.has_started ? undefined : row?.edges}
                    failedChecks={p.checks[v.game_id]?.failed ?? []}
                  />
                );
              })}
              {verdicts.length === 0 ? (
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
