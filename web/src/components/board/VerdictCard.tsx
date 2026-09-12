import { direction, homeLine, intensity, line, pct, price, signedPct } from "@/lib/edge";
import { kickoffFromPayload } from "@/lib/format";
import type { BoardRow, Chip, EdgeSide, VerdictPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckStatus } from "./CheckStatus";
import { EdgeDiff } from "./EdgeCell";
import { GameOutcome } from "./GameOutcome";
import { Matchup } from "./TeamDot";
import { emphasize } from "./emphasize";

/**
 * One game in Plain English mode. Pure over the persisted payload: the sentences are rendered
 * verbatim (key facts bolded by regex), the chips come from payload.chips.
 * - status 'fail' → the single withheld sentence, a --edge-neg banner, no chips.
 * - no snapshot (one sentence, chips null) → "No line posted yet", fair numbers muted.
 * - status 'warn' → --warn dot with the failing check names.
 */
function liveForChip(chip: Chip | null | undefined, edges?: BoardRow["edges"]): EdgeSide | null {
  if (!chip || !edges) return null;
  if (chip.market_type === "total") return chip.side === "under" ? edges.total_under : edges.total_over;
  if (chip.market_type === "moneyline") return chip.side === "away" ? edges.ml_away : edges.ml_home;
  return chip.side === "away" ? edges.spread_away : edges.spread_home;
}

function overlayChip(chip: Chip | null | undefined, live: EdgeSide | null | undefined): Chip | null {
  if (!chip) return chip ?? null;
  if (!live) return chip;
  return { ...chip, prob: live.model_prob, market_prob: live.market_prob, edge: live.edge, price: live.price };
}

export function VerdictCard({
  payload,
  row,
  liveEdges,
  failedChecks = [],
  onOpen,
  className,
}: {
  payload: VerdictPayload;
  row?: BoardRow;
  liveEdges?: BoardRow["edges"];
  failedChecks?: string[];
  onOpen?: (gameId: string) => void;
  className?: string;
}) {
  const started = Boolean(row?.has_started);
  const { status, sentences } = payload;
  const chips =
    started || !payload.chips
      ? payload.chips
      : {
          side: overlayChip(payload.chips.side, liveForChip(payload.chips.side, liveEdges)),
          total: overlayChip(payload.chips.total, liveForChip(payload.chips.total, liveEdges)),
          home_wins: overlayChip(payload.chips.home_wins, liveForChip(payload.chips.home_wins, liveEdges)),
        };
  const withheld = status === "fail";
  const noLine = !withheld && !started && chips == null;
  const moved = payload.market?.moved_since_sim;
  const movedParts = [
    moved?.spread ? `spread ${fmtLine(moved.spread.from)} → ${fmtLine(moved.spread.to)}` : null,
    moved?.total ? `total ${moved.total.from} → ${moved.total.to}` : null,
  ].filter(Boolean);
  const movedNote = movedParts.length ? `moved since sim: ${movedParts.join(", ")}` : null;

  return (
    <article
      className={cn("card flex gap-4 p-4", className)}
      data-status={status}
      data-game={payload.game_id}
      aria-labelledby={`verdict-${payload.game_id}`}
    >
      <div className="min-w-0 flex-1">
        <header className="mb-2 flex items-center gap-3">
          <h3 id={`verdict-${payload.game_id}`} className="t-body flex items-center gap-2">
            <Matchup home={payload.home} away={payload.away} />
          </h3>
          <span className="t-caption">{kickoffFromPayload(payload.kickoff)}</span>
          {movedNote ? <span className="t-caption text-warn">{movedNote}</span> : null}
          <CheckStatus status={status} failed={failedChecks} className="ml-auto" />
          {onOpen ? (
            <button
              type="button"
              onClick={() => onOpen(payload.game_id)}
              className="t-caption rounded-sm px-1.5 py-0.5 hover:bg-accent hover:text-foreground"
            >
              details
            </button>
          ) : null}
        </header>

        {withheld ? (
          <div className="mb-2 rounded-md border border-edge-neg/30 bg-edge-neg-tint px-3 py-2 t-body text-edge-neg">
            This run failed an invariant for this game; edges withheld.
          </div>
        ) : null}

        {started && row ? (
          <GameOutcome row={row} />
        ) : (
          <div className={cn("flex flex-col gap-1 t-sentence", noLine && "text-muted-foreground")}>
            {sentences.map((s, i) => (
              <p key={i}>{emphasize(s)}</p>
            ))}
          </div>
        )}

        {noLine ? (
          <p className="mt-2 t-caption">
            No line posted yet · fair {payload.fair.spread != null ? `home ${(-payload.fair.spread).toFixed(1)}` : "—"} ·
            total {payload.fair.total?.toFixed(1) ?? "—"}
          </p>
        ) : null}
      </div>

      {!withheld && !started && chips ? (
        <aside className="flex w-[196px] shrink-0 flex-col gap-2 border-l border-border-soft pl-4" aria-label="Chips">
          <ChipRow name="Side" chip={chips.side ?? null} />
          <ChipRow name="Total" chip={chips.total ?? null} />
          <ChipRow name="Home wins" chip={chips.home_wins ?? null} probOnly />
        </aside>
      ) : null}
    </article>
  );
}

/** nflverse spread (positive = home favored) shown as the home team's book line. */
function fmtLine(nflverseSpread: number): string {
  return line(homeLine(nflverseSpread));
}

function ChipRow({ name, chip, probOnly = false }: { name: string; chip: Chip | null; probOnly?: boolean }) {
  if (!chip) {
    return (
      <div className="flex items-baseline justify-between gap-2" data-chip={name}>
        <span className="t-colhead text-muted-foreground">{name}</span>
        <span className="t-caption">—</span>
      </div>
    );
  }
  const dir = direction(chip.edge);
  const inten = intensity(chip.edge);
  return (
    <div className="flex flex-col gap-0.5" data-chip={name} data-edge={dir}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="t-colhead text-muted-foreground">{name}</span>
        <EdgeDiff dir={dir} inten={inten} className="text-[13px]">
          {signedPct(chip.edge)}
        </EdgeDiff>
      </div>
      <div className="tnum flex items-baseline justify-between gap-2 t-body">
        <span className="truncate">{probOnly ? "Home" : chip.label ?? "—"}</span>
        <span className="text-muted-foreground">
          <span className="text-foreground font-semibold">{pct(chip.prob)}</span>
          <span className="text-dim"> · </span>
          <span className="text-line font-semibold">{pct(chip.market_prob)}</span>
          {chip.price != null ? <span className="text-muted-foreground"> {price(chip.price)}</span> : null}
        </span>
      </div>
    </div>
  );
}
