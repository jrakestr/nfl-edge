import { TeamLogo } from "@/components/ui/TeamLogo";
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

function Elo({ rating }: { rating: number | null | undefined }) {
  if (rating === undefined) return null;
  const text =
    rating == null || !Number.isFinite(rating) ? "—" : Number.isInteger(rating) ? String(rating) : rating.toFixed(1);
  return <span className="t-body tnum text-foreground">{text}</span>;
}

export function Matchup({
  home,
  away,
  className,
  variant = "dot",
  homeElo,
  awayElo,
}: {
  home: string;
  away: string;
  className?: string;
  variant?: "dot" | "logo";
  /** Stored run Elo. Omit to hide. Null is an em dash. 0 is shown as 0. */
  homeElo?: number | null;
  awayElo?: number | null;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {variant === "logo" ? <TeamLogo team={away} /> : <TeamDot abbr={away} />}
      <Elo rating={awayElo} />
      <span className="text-muted-foreground">@</span>
      {variant === "logo" ? <TeamLogo team={home} /> : <TeamDot abbr={home} />}
      <Elo rating={homeElo} />
    </span>
  );
}
