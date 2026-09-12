/** DK team abbrevs that differ from nflverse / schedules. Mirrors ingest/names.py TEAM_ALIASES. */
const TEAM_ALIASES: Record<string, string> = {
  LAR: "LA",
  JAC: "JAX",
  WSH: "WAS",
};

const GAME_INFO_RE = /^([A-Z]{2,3})@([A-Z]{2,3})\s+\d{2}\/\d{2}\/\d{4}\s+\d{1,2}:\d{2}[AP]M\s+ET$/i;

export type SlatePage = "players" | "dfs" | "optimize" | "games";

export type ParsedGameInfo = { away: string; home: string };

export type ResolvedSlate = { slate: string; fallback: boolean };

function mapTeam(abbr: string): string {
  const up = abbr.toUpperCase();
  return TEAM_ALIASES[up] ?? up;
}

/** Last suffix of `2026_01_main` (or a short key already). */
export function slateKey(slateId: string): string {
  const m = slateId.match(/^\d+_\d+_(.+)$/);
  return m?.[1] ?? slateId;
}

/** `AWAY@HOME MM/DD/YYYY HH:MMPM ET` → nflverse team pair. */
export function parseGameInfo(raw: string | null | undefined): ParsedGameInfo | null {
  if (!raw) return null;
  const m = raw.trim().match(GAME_INFO_RE);
  if (!m) return null;
  return { away: mapTeam(m[1]!), home: mapTeam(m[2]!) };
}

export function resolveSlate(requested: string, available: readonly string[]): ResolvedSlate {
  const key = requested.trim();
  if (key && available.includes(key)) return { slate: key, fallback: false };
  return { slate: "main", fallback: true };
}

/** Path `[slate]` wins over `?slate=`. Empty → main. */
export function requestedSlate(pathSlate: string | undefined, querySlate: string | undefined): string {
  const path = pathSlate?.trim();
  if (path) return path;
  const q = querySlate?.trim();
  if (q) return q;
  return "main";
}

export function slateHref(args: {
  page: SlatePage;
  week: number | string;
  site: string;
  slate: string;
}): string {
  const { page, week, site, slate } = args;
  if (page === "games") return `/week/${week}/games?slate=${slate}`;
  return `/week/${week}/${page}/${site}/${slate}`;
}

export function fallbackNotice(requested: string): string {
  return `Unknown slate “${requested}”; showing Main.`;
}
