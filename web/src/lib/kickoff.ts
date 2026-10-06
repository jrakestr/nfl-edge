/**
 * Display clock for "has this game started?" Twin of
 * `nfl_edge.results.grade.kickoff_at` — Neutral sites cut at gameday 00:00 ET
 * so a stored evening gametime cannot keep a live pick up after a morning
 * international kickoff. Do not use this to pick a grading run; that rule
 * lives only in grade.py and is recorded on model.results.predated_kickoff.
 */
const ET = "America/New_York";

function etWallToUtc(gameday: string, hour: number, minute: number): Date {
  const y = Number(gameday.slice(0, 4));
  const mo = Number(gameday.slice(5, 7));
  const d = Number(gameday.slice(8, 10));
  for (const offset of [4, 5]) {
    const utc = new Date(Date.UTC(y, mo - 1, d, hour + offset, minute));
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: ET,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(utc);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    if (
      get("year") === gameday.slice(0, 4) &&
      get("month") === gameday.slice(5, 7) &&
      get("day") === gameday.slice(8, 10) &&
      Number(get("hour")) === hour &&
      Number(get("minute")) === minute
    ) {
      return utc;
    }
  }
  return new Date(`${gameday}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00-04:00`);
}

/** ET instant of the kickoff cutoff. Neutral → midnight; missing time → 23:59. */
export function kickoffCutoff(gameday: string, gametime: string | null, location: string | null): Date {
  const wall = location === "Neutral" ? "00:00" : gametime && gametime !== "" ? gametime : "23:59";
  const [hh, mm] = wall.split(":").map(Number);
  return etWallToUtc(gameday, hh, mm);
}

export function hasStarted(
  gameday: string,
  gametime: string | null,
  location: string | null,
  now: Date = new Date(),
): boolean {
  return now.getTime() >= kickoffCutoff(gameday, gametime, location).getTime();
}

export function stillToPlay(row: { has_started: boolean }): boolean {
  return !row.has_started;
}

export type KickoffWindow = "early" | "afternoon" | "primetime";

/**
 * Sunday 1:00 ET = early; 4:05/4:25 = afternoon; TNF/SNF/MNF = primetime.
 * Neutral/international stored clocks are not trusted — return null (Melbourne lesson).
 */
export function kickoffWindow(
  gameday: string,
  gametime: string | null,
  location: string | null,
): KickoffWindow | null {
  if (location === "Neutral") return null;
  if (!gametime) return null;
  const [hh, mm] = gametime.split(":").map(Number);
  if (!Number.isFinite(hh)) return null;
  const dow = new Date(`${gameday}T12:00:00Z`).getUTCDay();
  if (dow === 4 || dow === 1) return "primetime";
  if (dow === 0) {
    if (hh < 15) return "early";
    if (hh < 19) return "afternoon";
    return "primetime";
  }
  void mm;
  return "primetime";
}

export type WindowLabel = "1:00" | "4:05/4:25" | "primetime" | "Other";

export function windowLabel(window: KickoffWindow | null): WindowLabel {
  if (window === "early") return "1:00";
  if (window === "afternoon") return "4:05/4:25";
  if (window === "primetime") return "primetime";
  return "Other";
}

export type StripGame = {
  game_id: string;
  away: string;
  home: string;
  gameday: string;
  gametime: string | null;
  location: string | null;
  away_score: number | null;
  home_score: number | null;
  is_final: boolean;
};

export type StripGroup = {
  key: WindowLabel;
  label: WindowLabel;
  games: StripGame[];
};

function kickoffSortKey(g: StripGame): string {
  return `${g.gameday} ${g.gametime ?? "99:99"} ${g.game_id}`;
}

/** Groups by window; groups ordered by earliest kickoff; chips by kickoff then game_id. */
export function groupStripGames(games: readonly StripGame[]): StripGroup[] {
  const buckets = new Map<WindowLabel, StripGame[]>();
  for (const g of games) {
    const label = windowLabel(kickoffWindow(g.gameday, g.gametime, g.location));
    const list = buckets.get(label) ?? [];
    list.push(g);
    buckets.set(label, list);
  }
  const groups: StripGroup[] = [];
  for (const [label, list] of buckets) {
    list.sort((a, b) => kickoffSortKey(a).localeCompare(kickoffSortKey(b)));
    groups.push({ key: label, label, games: list });
  }
  groups.sort((a, b) => kickoffSortKey(a.games[0]!).localeCompare(kickoffSortKey(b.games[0]!)));
  return groups;
}

export function toStripGame(row: {
  game_id: string;
  away: string;
  home: string;
  gameday: string;
  gametime: string | null;
  location?: string | null;
  away_score?: number | null;
  home_score?: number | null;
  is_final?: boolean;
}): StripGame {
  return {
    game_id: row.game_id,
    away: row.away,
    home: row.home,
    gameday: row.gameday,
    gametime: row.gametime,
    location: row.location ?? null,
    away_score: row.away_score ?? null,
    home_score: row.home_score ?? null,
    is_final: Boolean(row.is_final),
  };
}

