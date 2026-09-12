import { mapTeam } from "@/lib/slate";
import { TEAMS } from "@/lib/teams";
import { cn } from "@/lib/utils";

function logoSrc(raw: string): string | null {
  const nfl = mapTeam(raw);
  return TEAMS[nfl] ? `/logos/${nfl}.png` : null;
}

/** Mark + abbreviation. The img is decoration; the text is the accessible name. */
export function TeamLogo({
  team,
  size = 18,
  className,
}: {
  team: string;
  size?: number;
  className?: string;
}) {
  const raw = team.trim();
  if (!raw) {
    return <span className={cn("font-semibold", className)}>—</span>;
  }
  const src = logoSrc(raw);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {src ? (
        // already 64px RGBA; next/image would re-encode a decoration
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          aria-hidden
          width={size}
          height={size}
          className="object-contain"
        />
      ) : null}
      <span className="font-semibold">{raw}</span>
    </span>
  );
}
