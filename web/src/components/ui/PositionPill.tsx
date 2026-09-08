import { cn } from "@/lib/utils";

export const POSITIONS = ["QB", "RB", "WR", "TE", "DST"] as const;
export type Position = (typeof POSITIONS)[number];

const STYLE: Record<Position, string> = {
  QB: "bg-pos-qb-tint text-pos-qb",
  RB: "bg-pos-rb-tint text-pos-rb",
  WR: "bg-pos-wr-tint text-pos-wr",
  TE: "bg-pos-te-tint text-pos-te",
  DST: "bg-pos-dst-tint text-pos-dst",
};

/** Real position only. FLEX slots pass the player's actual position, never "FLEX". */
export function normalizePosition(raw: string | null | undefined): Position | null {
  if (!raw) return null;
  const p = raw.trim().toUpperCase();
  if (p === "D" || p === "DEF" || p === "DST") return "DST";
  if (p === "QB" || p === "RB" || p === "WR" || p === "TE") return p;
  return null;
}

export function PositionPill({
  position,
  className,
}: {
  position: string | null | undefined;
  className?: string;
}) {
  const pos = normalizePosition(position);
  if (!pos) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-sm px-1.5 t-caption font-semibold",
        STYLE[pos],
        className,
      )}
      aria-label={pos}
    >
      {pos}
    </span>
  );
}
