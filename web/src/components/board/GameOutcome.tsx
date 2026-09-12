import { direction, displayValue, intensity, signed, signedPct } from "@/lib/edge";
import type { BoardRow, GradedMarket } from "@/lib/types";
import { cn } from "@/lib/utils";
import { EdgeDiff } from "./EdgeCell";

function outcomeLabel(outcome: number | null): string {
  if (outcome === 1) return "Won";
  if (outcome === 0) return "Lost";
  return "Push";
}

function Delta({ actual, predicted }: { actual: number; predicted: number }) {
  const diff = actual - predicted;
  return (
    <span className="tnum">
      <span className="font-semibold text-foreground">{signed(actual)}</span>
      <span className="text-dim"> · </span>
      <span className="font-semibold text-foreground">{signed(predicted)}</span>
      <span className="text-dim"> · </span>
      <EdgeDiff dir={direction(diff)} inten={intensity(Math.abs(diff) >= 1 ? 0.03 : 0.005)}>
        {signed(diff)}
      </EdgeDiff>
    </span>
  );
}

function MarketLine({ name, market }: { name: string; market: GradedMarket | null }) {
  if (!market) return null;
  return (
    <div className="flex items-baseline justify-between gap-3" data-market={name}>
      <span className="t-colhead text-muted-foreground">{name}</span>
      <span className="t-body">
        <span className="font-semibold text-foreground">{outcomeLabel(market.outcome)}</span>
        {market.clv != null ? (
          <>
            <span className="text-dim"> · </span>
            <span className="t-caption text-muted-foreground">CLV {signedPct(market.clv)}</span>
          </>
        ) : null}
      </span>
    </div>
  );
}

/** Final score + model deltas, or "In progress". Replaces the live pick. */
export function GameOutcome({ row, compact = false }: { row: BoardRow; compact?: boolean }) {
  if (!row.is_final) {
    return (
      <p className="t-body" data-game-state="in-progress">
        In progress
      </p>
    );
  }
  const predSpread = displayValue(row.mean_spread, row.fair_spread);
  const predTotal = displayValue(row.mean_total, row.fair_total);
  return (
    <div className={cn("flex flex-col gap-1", compact && "gap-0.5")} data-game-state="final">
      <p className="t-body font-semibold text-foreground">
        {row.away} {row.away_score} – {row.home} {row.home_score}
      </p>
      {row.result != null && predSpread != null ? (
        <p className="t-caption">
          Margin <Delta actual={row.result} predicted={predSpread} />
        </p>
      ) : null}
      {row.result != null && predTotal != null ? (
        <p className="t-caption">
          Total{" "}
          <Delta
            actual={(row.away_score ?? 0) + (row.home_score ?? 0)}
            predicted={predTotal}
          />
        </p>
      ) : null}
      <MarketLine name="Spread" market={row.graded?.spread ?? null} />
      <MarketLine name="Total" market={row.graded?.total ?? null} />
      <MarketLine name="Moneyline" market={row.graded?.moneyline ?? null} />
    </div>
  );
}
