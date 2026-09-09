/** DK Game Info: `NO@DET 09/07/2026 01:00PM ET`. */

const GAME = /^([A-Z]{2,3})@([A-Z]{2,3})\b/;

export function parseGameInfo(gameInfo: string | null | undefined): { away: string; home: string } | null {
  if (!gameInfo) return null;
  const m = GAME.exec(gameInfo.trim().toUpperCase());
  if (!m) return null;
  return { away: m[1]!, home: m[2]! };
}

export function opponentOf(gameInfo: string | null | undefined, team: string | null | undefined): string | null {
  const g = parseGameInfo(gameInfo);
  const t = (team ?? "").toUpperCase();
  if (!g || !t) return null;
  if (t === g.home) return g.away;
  if (t === g.away) return g.home;
  return null;
}

export function gameKey(gameInfo: string | null | undefined): string {
  const g = parseGameInfo(gameInfo);
  return g ? `${g.away}@${g.home}` : (gameInfo ?? "");
}
