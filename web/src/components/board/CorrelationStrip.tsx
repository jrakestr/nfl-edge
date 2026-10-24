import { PositionPill } from "@/components/ui/PositionPill";
import { corrLabel, signedCorr } from "@/lib/game-detail";
import type { CorrPair } from "@/lib/types";

/** Top-8 within-game DK point correlations from model.player_correlations. */
export function CorrelationStrip({ correlations }: { correlations: readonly CorrPair[] }) {
  const rows = correlations.slice(0, 8);
  return (
    <section aria-label="Correlations" className="flex flex-col gap-2">
      <h3 className="t-colhead text-muted-foreground">Correlations</h3>
      {rows.length === 0 ? (
        <p className="t-caption">No correlations on this run.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((pair) => {
            const widthPct = Math.min(100, Math.max(0, Math.abs(pair.corr) * 100));
            return (
              <li key={`${pair.a}-${pair.b}`} className="flex flex-col gap-1">
                <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  <PositionPill position={pair.a_pos ?? null} />
                  <span className="font-semibold text-foreground">{pair.a}</span>
                  <span className="t-caption text-muted-foreground">↔</span>
                  <PositionPill position={pair.b_pos ?? null} />
                  <span className="font-semibold text-foreground">{pair.b}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="relative block h-1.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted">
                    <span
                      data-corr-bar=""
                      className="block h-full rounded-sm bg-foreground"
                      style={{ width: `${widthPct}%` }}
                    />
                  </span>
                  <span className="t-caption shrink-0">{corrLabel(pair.corr)}</span>
                  <span className="tnum t-body shrink-0 font-semibold text-foreground">{signedCorr(pair.corr)}</span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
