import type { Metadata } from "next";
import { GamesList } from "@/components/games/GamesList";
import { SlateSelector } from "@/components/shell/SlateSelector";
import { CURRENT_SEASON } from "@/lib/config";
import { boardRows } from "@/lib/queries/board";
import { checksForRun } from "@/lib/queries/checks";
import { slateGameInfos, slateId, slatesForWeek } from "@/lib/queries/dfs";
import { ngsByGame } from "@/lib/queries/games";
import { topPlayersByGame } from "@/lib/queries/players";
import { pickDefaultRun, runsForWeek, slateGameCount } from "@/lib/queries/runs";
import { requestedSlate, resolveSlate, filterGamesForSlate } from "@/lib/slate";
import { verdictsForRun } from "@/lib/queries/verdicts";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/week/[n]/games">): Promise<Metadata> {
  const { n } = await params;
  return { title: `Week ${n} · Games` };
}

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({
  params,
  searchParams,
}: PageProps<"/week/[n]/games">) {
  const { n } = await params;
  const sp = await searchParams;
  const week = Number(n);
  const seasonParam = Number(one(sp.season));
  const season = Number.isInteger(seasonParam) && seasonParam > 2000 ? seasonParam : CURRENT_SEASON;
  const weekOk = Number.isInteger(week) && week >= 1 && week <= 22;
  const pinned = one(sp.run);
  const [runs, weekGames, available] = weekOk
    ? await Promise.all([
        runsForWeek(season, week),
        slateGameCount(season, week),
        slatesForWeek(season, week, "dk"),
      ])
    : [[], 0, [] as string[]];
  const requested = requestedSlate(undefined, one(sp.slate));
  const resolved = resolveSlate(requested, available);
  const fallbackFrom = resolved.fallback && requested !== "main" ? requested : null;
  const slate = resolved.slate;
  const run = pickDefaultRun(runs, weekGames, pinned);
  const sid = weekOk ? slateId(season, week, slate) : "";

  const [allRows, verdicts, checks, playersByGame, infos] = run
    ? await Promise.all([
        boardRows(run.run_id),
        verdictsForRun(run.run_id),
        checksForRun(run.run_id),
        topPlayersByGame(run.run_id),
        sid ? slateGameInfos("dk", sid) : Promise.resolve([] as string[]),
      ])
    : [[], [], new Map(), {}, [] as string[]];

  const filtered = infos.length ? filterGamesForSlate(allRows, infos) : allRows;
  const ngs = await ngsByGame(filtered.map((r) => r.game_id));
  const rows = filtered.map((r) => ({ ...r, ...ngs[r.game_id] }));

  return (
    <GamesList
      week={weekOk ? week : undefined}
      rows={rows}
      weekTotal={weekGames || allRows.length}
      verdicts={Object.fromEntries(verdicts.map((v) => [v.game_id, v.payload]))}
      checks={Object.fromEntries(checks)}
      playersByGame={playersByGame}
      fallbackFrom={fallbackFrom}
      toolbar={
        <SlateSelector week={week} site="dk" page="games" slate={slate} slates={available} />
      }
    />
  );
}
