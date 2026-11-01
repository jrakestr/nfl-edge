import { cn } from "@/lib/utils";

export const POSITIONS = ["QB", "RB", "WR", "TE", "DST"] as const;
export type Position = (typeof POSITIONS)[number];

/** Individual defenders from the sim (correlation rows). Display only; never a DFS slot. */
export const DEFENDER_POSITIONS = ["DL", "LB", "DB"] as const;
export type DefenderPosition = (typeof DEFENDER_POSITIONS)[number];

const STYLE: Record<Position | DefenderPosition, string> = {
  QB: "bg-pos-qb",
  RB: "bg-pos-rb",
  WR: "bg-pos-wr",
  TE: "bg-pos-te",
  DST: "bg-pos-dst",
  DL: "bg-pos-dst",
  LB: "bg-pos-dst",
  DB: "bg-pos-dst",
};

/** Real position only. FLEX slots pass the player's actual position, never "FLEX". */
export function normalizePosition(raw: string | null | undefined): Position | null {
  if (!raw) return null;
  const p = raw.trim().toUpperCase();
  if (p === "D" || p === "DEF" || p === "DST") return "DST";
  if (p === "QB" || p === "RB" || p === "WR" || p === "TE") return p;
  return null;
}

export function defenderPosition(raw: string | null | undefined): DefenderPosition | null {
  const p = raw?.trim().toUpperCase();
  return (DEFENDER_POSITIONS as readonly string[]).includes(p ?? "") ? (p as DefenderPosition) : null;
}

export function PositionPill({
  position,
  className,
}: {
  position: string | null | undefined;
  className?: string;
}) {
  const pos = normalizePosition(position) ?? defenderPosition(position);
  if (!pos) return null;
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center justify-center rounded-sm px-2 t-body font-bold tracking-wide text-pos-ink",
        STYLE[pos],
        className,
      )}
      aria-label={pos}
    >
      {pos}
    </span>
  );
}
