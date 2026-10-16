import {
  DIMENSION_TITLES,
  GATE_TEXT,
  TIER_NOTE,
  fixed,
  gateText,
  groupByDimension,
  resid,
  residPct,
  weeksMissing,
  weeksText,
  type PlayerBiasData,
} from "@/lib/player-bias";
import { cn } from "@/lib/utils";

const TH = "t-colhead px-3 py-2 text-right text-muted-foreground";

/** Projected against actual DK points, by position, tier, and usage channel. Read-only. */
export function PlayerBias({ data, gradedWeeks }: { data: PlayerBiasData; gradedWeeks: number[] }) {
  const missing = weeksMissing(data.weeks, gradedWeeks);
  if (data.cells.length === 0 || data.weeks.length === 0) {
    return (
      <section className="card p-4" aria-label="Player projections vs actual">
        <h2 className="t-body font-semibold">Player projections vs actual</h2>
        <p className="mt-2 t-caption">
          No player comparison yet.
          {gradedWeeks.length
            ? ` Weeks without one: ${weeksText(gradedWeeks)}. It is written when a week is graded, once every game has a final.`
            : " It is written when a week is graded, once every game has a final."}
        </p>
      </section>
    );
  }
  const groups = groupByDimension(data.cells);
  const candidates = data.cells.filter((c) => c.state === "candidate");
  return (
    <section className="card flex flex-col gap-4 p-4" aria-label="Player projections vs actual">
      <header>
        <h2 className="t-body font-semibold">Player projections vs actual</h2>
        <p className="mt-1 t-caption">
          Residual is actual minus projected DK points; positive means the model was light. Weeks
          compared: {weeksText(data.weeks)}. {data.compared} players compared; {data.didNotPlay}{" "}
          projected but did not play and are left out.
          {missing.length
            ? ` Not compared yet: week${missing.length === 1 ? "" : "s"} ${weeksText(missing)}.`
            : ""}
        </p>
        <p className="mt-1 t-caption">{GATE_TEXT}</p>
      </header>
      <p className="t-body font-semibold" aria-label="Gate result">
        {candidates.length === 0
          ? "No cell passes the gate. No prior change is eligible."
          : `${candidates.length} cell${candidates.length === 1 ? "" : "s"} pass the gate: ${candidates
              .map((c) => `${DIMENSION_TITLES[c.dimension] ?? c.dimension}: ${c.label}`)
              .join("; ")}.`}
      </p>
      {groups.map((g) => (
        <div key={g.dimension} className="flex flex-col gap-1">
          <h3 className="t-body font-semibold">{g.title}</h3>
          {g.dimension === "tier" ? <p className="t-caption">{TIER_NOTE}</p> : null}
          <div className="overflow-x-auto">
            <table className="w-full" aria-label={g.title}>
              <thead>
                <tr className="border-b border-border">
                  <th className="t-colhead px-3 py-2 text-left text-muted-foreground">Group</th>
                  <th className={TH}>Players</th>
                  <th className={TH}>Projected</th>
                  <th className={TH}>Actual</th>
                  <th className={TH}>Residual</th>
                  <th className={TH}>Residual %</th>
                  <th className={TH}>Miss</th>
                  <th className={TH}>Std error</th>
                  <th className="t-colhead px-3 py-2 text-left text-muted-foreground">Gate</th>
                </tr>
              </thead>
              <tbody>
                {g.cells.map((c) => (
                  <tr key={c.label} className="border-b border-border-soft">
                    <td className="t-body px-3 py-2">{c.label}</td>
                    <td className="t-body tnum px-3 py-2 text-right">{c.n}</td>
                    <td className="t-body tnum px-3 py-2 text-right">{fixed(c.projected)}</td>
                    <td className="t-body tnum px-3 py-2 text-right">{fixed(c.actual)}</td>
                    <td
                      className={cn(
                        "t-body tnum px-3 py-2 text-right font-semibold",
                        c.meanResid == null || Math.abs(c.meanResid) < 0.005
                          ? "text-foreground"
                          : c.meanResid > 0
                            ? "text-edge-pos"
                            : "text-edge-neg",
                      )}
                    >
                      {resid(c.meanResid)}
                    </td>
                    <td className="t-body tnum px-3 py-2 text-right">{residPct(c.meanPct)}</td>
                    <td className="t-body tnum px-3 py-2 text-right">{fixed(c.mae)}</td>
                    <td className="t-body tnum px-3 py-2 text-right">{fixed(c.se)}</td>
                    <td className="t-body px-3 py-2">
                      <span className={c.state === "candidate" ? "font-semibold" : undefined}>
                        {gateText(c)}
                      </span>
                      {c.owner ? <span className="block t-caption">Would go through {c.owner}</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
