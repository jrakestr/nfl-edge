import { pct } from "@/lib/edge";

/** NFLGameSim numbers sit beside ours in muted caption type. Never blended into the sim. */
export function NgsMute({
  away,
  home,
  pWin,
}: {
  away?: number | null;
  home?: number | null;
  pWin?: number | null;
}) {
  const score = away != null && home != null ? `${away.toFixed(1)}–${home.toFixed(1)}` : null;
  const win = pWin != null ? pct(pWin) : null;
  if (!score && !win) return null;
  return (
    <span className="t-caption text-muted-foreground">
      NFLGameSim{score ? ` ${score}` : ""}
      {win ? ` · ${win}` : ""}
    </span>
  );
}
