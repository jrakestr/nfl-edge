import { STRONG, signedPct } from "@/lib/edge";
import type { TrackRecord } from "@/lib/queries/results";
import type { VerdictPayload } from "@/lib/types";

export function tileCounts(payloads: VerdictPayload[]) {
  const withLine = payloads.filter((p) => p.chips != null && p.status !== "fail");
  const sides = withLine.filter((p) => (p.chips?.side?.edge ?? 0) >= STRONG).length;
  const totals = withLine.filter((p) => (p.chips?.total?.edge ?? 0) >= STRONG).length;
  return { games: payloads.length, withLine: withLine.length, sides, totals };
}

/** Four tiles above the table: games with a line · sides ≥ 3% · totals ≥ 3% · track record. */
export function SummaryTiles({ payloads, track }: { payloads: VerdictPayload[]; track: TrackRecord }) {
  const c = tileCounts(payloads);
  const graded = track.gradedWeeks > 0;
  return (
    <div className="grid grid-cols-4 gap-4" role="list" aria-label="Week summary tiles">
      <Tile label="Games with a line" value={`${c.withLine}`} sub={c.withLine < c.games ? `of ${c.games}` : undefined} />
      <Tile label="Sides clearing 3%" value={`${c.sides}`} sub={`of ${c.withLine}`} />
      <Tile label="Totals clearing 3%" value={`${c.totals}`} sub={`of ${c.withLine}`} />
      <Tile
        label="Track record"
        value={graded ? `${track.wins}-${track.losses}-${track.pushes}` : "—"}
        sub={
          graded
            ? `${track.gradedWeeks} graded week${track.gradedWeeks === 1 ? "" : "s"} · flat ROI ${track.roi != null ? signedPct(track.roi) : "—"}`
            : "No graded weeks yet"
        }
      />
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card flex flex-col gap-1 p-4" role="listitem">
      <span className="t-colhead text-muted-foreground">{label}</span>
      <span className="t-tile tnum">{value}</span>
      {sub ? <span className="t-caption">{sub}</span> : null}
    </div>
  );
}
