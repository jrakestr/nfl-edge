import { PlayersList } from "@/components/players/PlayersList";
import { CURRENT_SEASON, DEFAULT_WEEK } from "@/lib/config";
import { weekPlayers } from "@/lib/queries/players";
import { newestWeek, runsForWeek } from "@/lib/queries/runs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Players" };

export default async function Page() {
  const week = (await newestWeek(CURRENT_SEASON)) ?? DEFAULT_WEEK;
  const runs = await runsForWeek(CURRENT_SEASON, week);
  const run = runs[0] ?? null;
  const players = run ? await weekPlayers(run.run_id) : [];
  return <PlayersList players={players} />;
}
