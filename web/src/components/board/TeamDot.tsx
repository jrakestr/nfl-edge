import { team } from "@/lib/teams";
import { cn } from "@/lib/utils";

/** 8px team-color dot next to the abbreviation — the only place team colors appear. */
export function TeamDot({ abbr, className }: { abbr: string; className?: string }) {
  const t = team(abbr);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span aria-hidden className="inline-block size-2 rounded-full" style={{ background: t.color }} />
      <span className="font-semibold">{abbr}</span>
    </span>
  );
}

export function Matchup({ home, away, className }: { home: string; away: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <TeamDot abbr={away} />
      <span className="text-dim">@</span>
      <TeamDot abbr={home} />
    </span>
  );
}
