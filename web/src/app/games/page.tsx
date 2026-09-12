import { GamesList } from "@/components/games/GamesList";
import { CURRENT_SEASON, DEFAULT_WEEK } from "@/lib/config";
import { boardRows } from "@/lib/queries/board";
import { checksForRun } from "@/lib/queries/checks";
import { topPlayersByGame } from "@/lib/queries/players";
import { newestWeek, runForWeek } from "@/lib/queries/runs";
import { verdictsForRun } from "@/lib/queries/verdicts";

export const dynamic = "force-dynamic";
export const metadata = { title: "Games" };

export default async function Page() {
  const week = (await newestWeek(CURRENT_SEASON)) ?? DEFAULT_WEEK;
  const run = await runForWeek(CURRENT_SEASON, week);
  const [rows, verdicts, checks, playersByGame] = run
    ? await Promise.all([
        boardRows(run.run_id),
        verdictsForRun(run.run_id),
        checksForRun(run.run_id),
        topPlayersByGame(run.run_id),
      ])
    : [[], [], new Map(), {}];
  return (
    <GamesList
      week={week}
      rows={rows}
      verdicts={Object.fromEntries(verdicts.map((v) => [v.game_id, v.payload]))}
      checks={Object.fromEntries(checks)}
      playersByGame={playersByGame}
    />
  );
}
