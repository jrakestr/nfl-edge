import type { Bet, Withheld } from "@/lib/bets";
import { pct, price, signedPct } from "@/lib/edge";
import { kickoffLabel, shortRun, shortStamp } from "@/lib/format";

export function BetsPanel({
  bets,
  withheld,
  linesAsOf,
  runId,
  runCreatedAt,
}: {
  bets: readonly Bet[];
  withheld: readonly Withheld[];
  linesAsOf?: string | null;
  runId: string;
  runCreatedAt?: string | Date | null;
}) {
  const shortId = shortRun(runId);
  return (
    <section className="card flex flex-col gap-3 p-4" aria-label="Bets this week">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <h2 className="t-sentence font-semibold">Bets this week</h2>
          <span className="t-caption tnum font-semibold text-foreground">
            {bets.length} {bets.length === 1 ? "bet" : "bets"}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 t-caption text-muted-foreground">
          <span className="tnum">
            run {shortId}
            {runCreatedAt ? ` · ${shortStamp(runCreatedAt)}` : ""}
          </span>
          {linesAsOf ? <span className="tnum">lines as of {shortStamp(linesAsOf)}</span> : null}
        </div>
      </div>

      {bets.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full caption-bottom t-body" aria-label="Qualifying bets">
            <thead className="bg-muted">
              <tr className="text-left t-colhead text-muted-foreground">
                <th className="px-3 py-2 font-medium">Game</th>
                <th className="px-3 py-2 font-medium">Bet</th>
                <th className="px-3 py-2 text-right font-medium">Line</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
                <th className="px-3 py-2 text-right font-medium">Edge</th>
                <th className="px-3 py-2 text-right font-medium">Model P</th>
                <th className="px-3 py-2 text-right font-medium">Stake (¼ Kelly)</th>
                <th className="px-3 py-2 text-right font-medium">Flat</th>
              </tr>
            </thead>
            <tbody>
              {bets.map((b) => (
                <tr
                  key={`${b.gameId}-${b.marketType}-${b.side}`}
                  className="border-t border-border-soft"
                  data-bet={`${b.gameId}-${b.marketType}-${b.side}`}
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-semibold text-foreground">
                      {b.away} @ {b.home}
                    </span>
                    <span className="ml-2 t-caption text-muted-foreground">
                      {kickoffLabel(b.gameday, b.gametime)}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-semibold text-foreground whitespace-nowrap">{b.pickLabel}</td>
                  <td className="tnum px-3 py-2 text-right text-line">{b.line}</td>
                  <td className="tnum px-3 py-2 text-right text-line">{price(b.price)}</td>
                  <td className="tnum px-3 py-2 text-right font-semibold text-edge-pos">
                    {signedPct(b.edge, 1)}
                  </td>
                  <td className="tnum px-3 py-2 text-right font-semibold text-foreground">
                    {pct(b.modelProb, 0)}
                  </td>
                  <td className="tnum px-3 py-2 text-right font-semibold text-foreground">
                    {pct(b.kellyFraction, 1)}
                  </td>
                  <td className="tnum px-3 py-2 text-right text-muted-foreground">1.0u</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5" data-zero-bets="true">
          {withheld.length === 0 ? (
            <p className="t-body text-muted-foreground">
              0 bets clear the 3.0% edge gate on unstarted games with passing checks.
            </p>
          ) : (
            <p className="t-body text-muted-foreground">
              0 bets clear every gate for run <span className="tnum font-semibold text-foreground">{shortId}</span>.
            </p>
          )}
        </div>
      )}

      {withheld.length > 0 ? (
        <ul className="flex flex-col gap-1 border-t border-border-soft pt-2 t-caption" aria-label="Withheld reasons">
          {withheld.map((w) => (
            <li key={`${w.kind}-${w.checkName}`} className="flex flex-wrap items-baseline gap-2">
              <span
                className={
                  w.kind === "invariant"
                    ? "font-semibold text-edge-neg"
                    : "font-semibold text-warn"
                }
              >
                {w.kind === "invariant" ? `Run ${shortId} ${w.reason}` : w.reason}
              </span>
              {w.kind === "gap" && w.items.length > 0 ? (
                <span className="tnum text-muted-foreground">
                  (
                  {w.items
                    .map(
                      (it) =>
                        `${it.away}@${it.home}${it.edge != null ? ` ${signedPct(it.edge, 1)}` : ""}`,
                    )
                    .join(", ")}
                  )
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
