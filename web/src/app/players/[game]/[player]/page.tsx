import type { Metadata } from "next";
import { PropDetail } from "@/components/prop/PropDetail";
import { CURRENT_SEASON } from "@/lib/config";
import { gameById, playerById, positionPeersForRun } from "@/lib/queries/players";
import {
  matchupRows,
  playerCorrs,
  playerFairProps,
  playerFptsActual,
  playerLog,
  playerNews,
  playerWeekGames,
  playerWeekLog,
  propHistogram,
  propTimeline,
} from "@/lib/queries/props";
import { displayWeek, runForWeek } from "@/lib/queries/runs";
import { defenseVsPosition, playerUsage } from "@/lib/queries/usage";
import type { Hist } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/players/[game]/[player]">): Promise<Metadata> {
  const { player } = await params;
  const header = await playerById(player);
  return { title: header?.display_name ?? "Player" };
}

export default async function PlayerDetailPage({ params }: PageProps<"/players/[game]/[player]">) {
  const { game, player } = await params;
  const [header, ctx, openWeek] = await Promise.all([
    playerById(player),
    gameById(game),
    displayWeek(CURRENT_SEASON),
  ]);
  const season = ctx?.season ?? CURRENT_SEASON;
  const week = ctx?.week ?? openWeek;
  const runPromise = runForWeek(season, week);
  const [run, weekLog, actualRows, games, fairs, news] = await Promise.all([
    runPromise,
    playerWeekLog(player, season, week),
    playerFptsActual(player),
    playerWeekGames(player, season, header?.latest_team ?? null),
    runPromise.then((ready) => (ready ? playerFairProps(ready.run_id, player) : [])),
    playerNews(player),
  ]);
  const opp = ctx && header?.latest_team ? (header.latest_team === ctx.home ? ctx.away : ctx.home) : null;
  const [usage, defense, fptsHist, peers] = await Promise.all([
    playerUsage(player, season, week),
    defenseVsPosition(season, week, opp, header?.position ?? null),
    run ? propHistogram(run.run_id, player, "fpts_ppr") : Promise.resolve(null),
    run ? positionPeersForRun(run.run_id, header?.position ?? null, player) : Promise.resolve([]),
  ]);
  const histByStat: Record<string, Hist | null> = {};
  let log: Awaited<ReturnType<typeof playerLog>> = [];
  let corrs: Awaited<ReturnType<typeof playerCorrs>> = [];
  let matchup: Awaited<ReturnType<typeof matchupRows>> = [];
  let timeline: Awaited<ReturnType<typeof propTimeline>> = [];
  if (fairs.length > 0) {
    const first = fairs[0]!;
    const [gameLog, corrRows, matchupRowsFor, snaps] = await Promise.all([
      playerLog(player, 20),
      run ? playerCorrs(run.run_id, player) : Promise.resolve([]),
      matchupRows(header?.latest_team ?? null, opp, season, week),
      ctx ? propTimeline(ctx.season, ctx.week, player, first.stat) : Promise.resolve([]),
    ]);
    log = gameLog;
    corrs = corrRows;
    matchup = matchupRowsFor;
    timeline = snaps;
    for (const fair of fairs) {
      histByStat[fair.stat] = fair.hist ?? null;
    }
  }
  return (
    <PropDetail
      player={header}
      game={ctx}
      playerId={player}
      fairs={fairs}
      log={log}
      corrs={corrs}
      matchup={matchup}
      timeline={timeline}
      histByStat={histByStat}
      actualRows={actualRows}
      currentSeason={CURRENT_SEASON}
      drawsPruned={Boolean(run?.draws_pruned)}
      asOf={{ season, week }}
      seasonLog={weekLog.log}
      projections={weekLog.projections}
      simProjections={weekLog.simProjections}
      games={games}
      usage={usage}
      defense={defense}
      fptsHist={fptsHist}
      opponent={opp}
      news={news}
      peers={peers}
      basePath="/players"
    />
  );
}
