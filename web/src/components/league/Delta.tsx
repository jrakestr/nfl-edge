import { EdgeDiff } from "@/components/board/EdgeCell";
import { signed } from "@/lib/edge";
import { pointsTone, winsTone } from "@/lib/league";

/**
 * The one colored thing on a league table: a difference. Model and actual values around it stay
 * foreground. `kind` picks the ramp: points (vs projection, margins, swing) or wins (luck).
 */
export function Delta({
  value,
  kind = "points",
  digits = 1,
  className,
}: {
  value: number | null | undefined;
  kind?: "points" | "wins";
  digits?: number;
  className?: string;
}) {
  if (value == null) return <span className={`tnum text-muted-foreground ${className ?? ""}`}>—</span>;
  const { dir, inten } = kind === "wins" ? winsTone(value) : pointsTone(value);
  return (
    <EdgeDiff dir={dir} inten={inten} className={className}>
      {signed(value, digits)}
    </EdgeDiff>
  );
}
