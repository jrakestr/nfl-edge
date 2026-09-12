"use client";

import { PositionPill } from "@/components/ui/PositionPill";
import { Button } from "@/components/ui/button";
import { stackSuggestions, type SlateCorr, type StackSuggestion } from "@/lib/optimize/stack-suggestions";
import type { WeekPlayer } from "@/lib/types";

function num(v: number, digits = 1): string {
  return v.toFixed(digits);
}

function SuggestionRow({
  row,
  showAnchor,
  onAdd,
}: {
  row: StackSuggestion;
  showAnchor: boolean;
  onAdd: (partnerDkId: string, anchorDkId: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b border-border-soft py-2 last:border-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="inline-flex items-center gap-1.5">
          <PositionPill position={row.position} />
          <span className="t-body font-semibold text-foreground">{row.name}</span>
          <span className="t-caption text-muted-foreground">{row.team}</span>
        </span>
        {showAnchor ? <span className="t-caption text-muted-foreground">vs {row.anchorName}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="tnum font-semibold text-foreground" title="Correlation">
          {num(row.corr, 2)}
        </span>
        <span className="tnum font-semibold text-foreground" title="Projection">
          {num(row.proj)}
        </span>
        <span className="tnum font-semibold text-foreground" title="Salary">
          {row.salary.toLocaleString("en-US")}
        </span>
        <span className="tnum font-semibold text-foreground" title="Value">
          {num(row.value, 2)}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onAdd(row.player_dk_id, row.anchorId)}
        >
          Require in stack
        </Button>
      </div>
    </li>
  );
}

export function StackSuggestions({
  players,
  pairs,
  locks,
  excludes,
  stack,
  onAdd,
}: {
  players: WeekPlayer[];
  pairs: SlateCorr[];
  locks: string[];
  excludes: string[];
  stack: string[];
  onAdd: (partnerDkId: string, anchorDkId: string) => void;
}) {
  if (locks.length === 0) return null;
  const { positive, negative } = stackSuggestions(players, pairs, locks, excludes, stack);
  const showAnchor = locks.length > 1;
  const empty = positive.length === 0 && negative.length === 0;

  return (
    <div className="mt-3 flex flex-col gap-3" aria-label="Stack suggestions">
      <p className="t-caption text-muted-foreground">
        Require in stack puts both players in every lineup while Require stacked group is on.
        Suggestions are additive to QB + n WR/TE and bring-back — the solver may already be
        guaranteeing a same-team pass catcher and an opponent.
      </p>
      {empty ? <p className="t-caption text-muted-foreground">No correlated partners in this pool.</p> : null}
      {positive.length > 0 ? (
        <section aria-label="Stack with">
          <h2 className="t-colhead text-muted-foreground">Stack with</h2>
          <ul>
            {positive.map((row) => (
              <SuggestionRow key={`p-${row.player_dk_id}`} row={row} showAnchor={showAnchor} onAdd={onAdd} />
            ))}
          </ul>
        </section>
      ) : null}
      {negative.length > 0 ? (
        <section aria-label="Negatively correlated">
          <h2 className="t-colhead text-muted-foreground">Negatively correlated</h2>
          <p className="t-caption text-muted-foreground">
            Game-script hedges: useful as bring-backs, costly as accidental overlap.
          </p>
          <ul>
            {negative.map((row) => (
              <SuggestionRow key={`n-${row.player_dk_id}`} row={row} showAnchor={showAnchor} onAdd={onAdd} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
