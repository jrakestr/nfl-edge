import type { Metadata } from "next";
import { PropDetail } from "@/components/prop/PropDetail";
import { CURRENT_SEASON, DEFAULT_WEEK } from "@/lib/config";
import { gameById, playerById } from "@/lib/queries/players";
import {
  matchupRows,
  playerCorrs,
  playerFairProps,
  playerLog,
  propHistogram,
  propTimeline,
} from "@/lib/queries/props";
import { newestWeek, runsForWeek } from "@/lib/queries/runs";
import type { Hist } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/props/[game]/[player]">): Promise<Metadata> {
  const { player } = await params;
  return { title: player };
}

export default async function PropPage({ params }: PageProps<"/props/[game]/[player]">) {
  const { game, player } = await params;
  const week = (await newestWeek(CURRENT_SEASON)) ?? DEFAULT_WEEK;
  const runs = await runsForWeek(CURRENT_SEASON, week);
  const run = runs[0] ?? null;
  const [header, ctx] = await Promise.all([playerById(player), gameById(game)]);
  const fairs = run ? await playerFairProps(run.run_id, player) : [];
  const log = await playerLog(player, 20);
  const corrs = run ? await playerCorrs(run.run_id, player) : [];
  const opp = ctx && header?.latest_team ? (header.latest_team === ctx.home ? ctx.away : ctx.home) : null;
  const matchup = await matchupRows(header?.latest_team ?? null, opp);
  const stats = fairs.map((e) => e.stat);
  const histByStat: Record<string, Hist | null> = {};
  if (run) {
    await Promise.all(
      stats.map(async (stat) => {
        histByStat[stat] = await propHistogram(run.run_id, player, stat);
      }),
    );
  }
  const first = fairs[0];
  const timeline =
    first && ctx
      ? await propTimeline(ctx.season, ctx.week, player, first.stat)
      : [];
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
    />
  );
}
