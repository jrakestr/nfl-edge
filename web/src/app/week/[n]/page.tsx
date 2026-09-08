import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WeekBoard } from "@/components/board/WeekBoard";
import { parseFilters } from "@/components/board/filters";
import type { RunOption } from "@/components/board/RunBadge";
import type { View } from "@/components/board/WeekHeader";
import { CURRENT_SEASON } from "@/lib/config";
import { boardRows } from "@/lib/queries/board";
import { checksForRun } from "@/lib/queries/checks";
import { topPlayersByGame } from "@/lib/queries/players";
import { trackRecord } from "@/lib/queries/results";
import { newerRunExists, runsForWeek, weeksWithRuns } from "@/lib/queries/runs";
import { verdictsForRun } from "@/lib/queries/verdicts";
import type { GameChecks, RunRow } from "@/lib/types";

// Data changes only when `sim`/`lines` run; the page reads searchParams so it renders per
// request anyway. No caching layer: 16 rows a request against the session pooler is fine.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/week/[n]">): Promise<Metadata> {
  const { n } = await params;
  return { title: `Week ${n}` };
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function toOption(r: RunRow): RunOption {
  return {
    run_id: r.run_id,
    created_at: r.created_at.toISOString(),
    draws_per_game: r.draws_per_game,
    git_sha: r.git_sha,
  };
}

export default async function WeekPage({ params, searchParams }: PageProps<"/week/[n]">) {
  const { n } = await params;
  const sp = await searchParams;
  const week = Number(n);
  if (!Number.isInteger(week) || week < 1 || week > 22) notFound();

  const seasonParam = Number(one(sp.season));
  const season = Number.isInteger(seasonParam) && seasonParam > 2000 ? seasonParam : CURRENT_SEASON;
  const view: View = one(sp.view) === "table" ? "table" : "plain";
  const pinned = one(sp.run);
  const filters = parseFilters(sp);

  const [weeks, runs, track] = await Promise.all([weeksWithRuns(season), runsForWeek(season, week), trackRecord(season)]);
  const run = runs.length ? (pinned ? runs.find((r) => r.run_id === pinned) ?? runs[0] : runs[0]) : null;

  const [verdicts, rows, checks, playersByGame] = run
    ? await Promise.all([
        verdictsForRun(run.run_id),
        boardRows(run.run_id),
        checksForRun(run.run_id),
        topPlayersByGame(run.run_id),
      ])
    : [[], [], new Map<string, GameChecks>(), {}];

  return (
    <WeekBoard
      season={season}
      week={week}
      weeks={weeks.map((w) => w.week)}
      view={view}
      filters={filters}
      run={run ? toOption(run) : null}
      runs={runs.map(toOption)}
      stale={run ? newerRunExists(run, runs) : false}
      verdicts={verdicts}
      rows={rows}
      checks={Object.fromEntries(checks)}
      track={track}
      playersByGame={playersByGame}
    />
  );
}
