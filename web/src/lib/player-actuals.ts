/** Season-labeled realized DK from model.player_fpts_actual. Display only. */

export type PlayerActualWeek = {
  season: number;
  week: number;
  opponent: string | null;
  gameday: string | null;
  fpts_dk: number;
  had_opportunity: boolean;
};

export type PlayerActualSummary =
  | { kind: "none" }
  | { kind: "dst" }
  | {
      kind: "ok";
      season: number;
      ppg: number;
      gp: number;
      games: PlayerActualWeek[];
    };

const LOG_N = 8;

export function isDstPosition(position: string | null | undefined): boolean {
  const p = (position ?? "").toUpperCase();
  return p === "DST" || p === "DEF";
}

export function pickActualSeason(rows: PlayerActualWeek[], currentSeason: number): number | null {
  const opp = rows.filter((r) => r.had_opportunity);
  if (opp.some((r) => r.season === currentSeason)) return currentSeason;
  const prior = currentSeason - 1;
  if (opp.some((r) => r.season === prior)) return prior;
  return null;
}

export function isDstCard(position?: string | null, playerId?: string): boolean {
  if (isDstPosition(position)) return true;
  return (playerId ?? "").toUpperCase().endsWith("_DST");
}

export function summarizeActuals(
  rows: PlayerActualWeek[],
  currentSeason: number,
  position?: string | null,
  playerId?: string,
): PlayerActualSummary {
  if (isDstCard(position, playerId)) return { kind: "dst" };
  const season = pickActualSeason(rows, currentSeason);
  if (season == null) return { kind: "none" };
  const games = rows
    .filter((r) => r.season === season && r.had_opportunity)
    .sort((a, b) => b.week - a.week);
  const gp = games.length;
  if (gp === 0) return { kind: "none" };
  const ppg = games.reduce((s, g) => s + g.fpts_dk, 0) / gp;
  return { kind: "ok", season, ppg, gp, games: games.slice(0, LOG_N) };
}
