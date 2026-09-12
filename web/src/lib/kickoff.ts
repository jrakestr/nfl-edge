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
