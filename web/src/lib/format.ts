/** Date/time formatting. Everything renders in ET (the league's clock) so SSR and client agree. */
const ET = "America/New_York";

/** 'YYYY-MM-DD' + 'HH:MM' (ET, as raw.schedules stores them) → "Sun 1:00 PM". */
export function kickoffLabel(gameday: string, gametime: string | null): string {
  const d = new Date(`${gameday}T12:00:00Z`);
  const dow = d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
  if (!gametime) return dow;
  const [h, m] = gametime.split(":").map(Number);
  const hour12 = ((h + 11) % 12) + 1;
  const ampm = h >= 12 ? "PM" : "AM";
  return `${dow} ${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/** Verdict payload kickoff 'YYYY-MM-DD HH:MM' → "Sun 1:00 PM". */
export function kickoffFromPayload(kickoff: string): string {
  const [day, time] = kickoff.split(" ");
  return kickoffLabel(day, time ?? null);
}

/** Timestamp → "Sat 06:30" in ET. */
export function shortStamp(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-US", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: ET,
  });
}

/** 20000 → "20k"; 5000 → "5k"; 500 → "500". */
export function draws(n: number | null | undefined): string {
  if (n == null) return "—";
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

export function shortRun(runId: string): string {
  return runId.slice(0, 6);
}
