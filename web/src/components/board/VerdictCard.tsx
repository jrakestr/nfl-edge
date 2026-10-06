import type { ReactNode } from "react";
import { direction, displayValue, homeLine, intensity, line, pct, price, signedPct } from "@/lib/edge";
import { kickoffFromPayload } from "@/lib/format";
import { americanToProb } from "@/lib/line-grid";
import type { BoardRow, Chip, EdgeSide, PayloadEdge, VerdictPayload } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CheckStatus } from "./CheckStatus";
import { EdgeDiff } from "./EdgeCell";
import { GameOutcome } from "./GameOutcome";
import { GapTrack } from "./GapTrack";
import { Matchup } from "./TeamDot";
import { emphasize } from "./emphasize";

/** Cover/pays is in Needs + Edge; a second spread sentence made that row ~2.5× the moneyline. */
export const SHOW_COVER_SENTENCE = false;

const COLS =
  "grid grid-cols-[minmax(4rem,6.5rem)_4rem_4rem_4rem_144px_4rem_4rem] items-center gap-x-3";

/** Vertical rail only between the three groups: Pick | comparison | outcome. */
const GROUP_RAIL = "border-l border-border-soft";

const LEDGER_HEADS = [
  { label: "Pick", rail: false },
  { label: "Ours", rail: true },
  { label: "Book", rail: false },
  { label: "Needs", rail: false },
  { label: "Gap", rail: false },
  { label: "Price", rail: true },
  { label: "Edge", rail: false },
] as const;

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

function payloadSide(payload: VerdictPayload, market: PayloadEdge["market_type"], side: PayloadEdge["side"]) {
  return payload.edges.find((e) => e.market_type === market && e.side === side) ?? null;
}

function overlayEdge(row: PayloadEdge | null, live: EdgeSide | null | undefined): PayloadEdge | null {
  if (!row) return null;
  if (!live) return row;
  return { ...row, model_prob: live.model_prob, market_prob: live.market_prob, edge: live.edge, price: live.price };
}

function needsPct(american: number | null | undefined): string {
  if (american == null) return "—";
  return pct(americanToProb(american), 1);
}

function fmtNflverse(nflverseSpread: number): string {
  return line(homeLine(nflverseSpread));
}

function pickLine(nflverse: number, side: "home" | "away"): number {
  return side === "home" ? homeLine(nflverse) : nflverse;
}

/**
 * One game in Plain English mode. Three-row ledger over the persisted payload.
 * Sentences are verbatim; Needs is americanToProb(price), never market_prob.
 */
export function VerdictCard({
  payload,
  row,
  liveEdges,
  failedChecks = [],
  gapCaptions = [],
  onOpen,
  className,
}: {
  payload: VerdictPayload;
  row?: BoardRow;
  liveEdges?: BoardRow["edges"];
  failedChecks?: string[];
  gapCaptions?: string[];
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
    moved?.spread ? `spread ${fmtNflverse(moved.spread.from)} → ${fmtNflverse(moved.spread.to)}` : null,
    moved?.total ? `total ${moved.total.from} → ${moved.total.to}` : null,
  ].filter(Boolean);
  const movedNote = movedParts.length ? `moved since sim: ${movedParts.join(", ")}` : null;

  const fairSpread = displayValue(payload.fair.spread_mean, payload.fair.spread);
  const marketSpread = payload.market?.spread ?? null;

  return (
    <article
      className={cn("card p-4", className)}
      data-status={status}
      data-game={payload.game_id}
      aria-labelledby={`verdict-${payload.game_id}`}
    >
      <header className="mb-2 flex flex-wrap items-center gap-3">
        <h3 id={`verdict-${payload.game_id}`} className="t-body flex items-center gap-2">
          <Matchup home={payload.home} away={payload.away} variant="logo" />
        </h3>
        <span className="t-caption">{kickoffFromPayload(payload.kickoff)}</span>
        {movedNote ? <span className="t-caption text-warn">{movedNote}</span> : null}
        {gapCaptions.map((c) => (
          <span key={c} className="t-caption text-warn">
            {c}
          </span>
        ))}
        <CheckStatus status={status} failed={failedChecks} className="ml-auto" />
        {onOpen ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(payload.game_id);
            }}
            className="t-caption rounded-sm px-1.5 py-0.5 text-foreground hover:bg-accent"
          >
            details
          </button>
        ) : null}
      </header>

      {withheld ? (
        <div className="rounded-md border border-edge-neg/30 bg-edge-neg-tint px-3 py-2 t-body text-edge-neg">
          This run failed an invariant for this game; edges withheld.
        </div>
      ) : null}

      {started && row ? <GameOutcome row={row} /> : null}

      {!withheld && !started && chips ? (
        <div>
          <div className={cn(COLS, "border-b border-border pb-1")} data-ledger-head="" aria-hidden>
            {LEDGER_HEADS.map((h) => (
              <span key={h.label} className={cn("t-colhead text-muted-foreground", h.rail && GROUP_RAIL)}>
                {h.label}
              </span>
            ))}
          </div>
          <SpreadRow
            payload={payload}
            chip={chips.side ?? null}
            fairSpread={fairSpread}
            marketSpread={marketSpread}
            sentences={sentences}
          />
          <TotalRow chip={chips.total ?? null} sentence={sentences[2]} />
          <MoneylineRow payload={payload} liveEdges={started ? undefined : liveEdges} sentence={sentences[3]} />
        </div>
      ) : null}

      {noLine ? (
        <div className="t-sentence text-foreground">
          {sentences.map((s, i) => (
            <p key={i}>{emphasize(s)}</p>
          ))}
          <p className="mt-2 t-caption">
            No line posted yet · fair {fairSide(payload)} · total {payload.fair.total?.toFixed(1) ?? "—"}
          </p>
        </div>
      ) : null}
    </article>
  );
}

function fairSide(payload: VerdictPayload): string {
  const s = displayValue(payload.fair.spread_mean, payload.fair.spread);
  if (s == null) return "—";
  if (Math.abs(s) < 0.5) return `${payload.away} / ${payload.home} even`;
  const fav = s > 0 ? payload.home : payload.away;
  return `${fav} ${line(-Math.abs(s))}`;
}

function SpreadRow({
  payload,
  chip,
  fairSpread,
  marketSpread,
  sentences,
}: {
  payload: VerdictPayload;
  chip: Chip | null;
  fairSpread: number | null;
  marketSpread: number | null;
  sentences: string[];
}) {
  const side = chip?.side === "away" || chip?.side === "home" ? chip.side : "home";
  const pick = side === "away" ? payload.away : payload.home;
  const ours = fairSpread != null ? line(pickLine(fairSpread, side)) : "—";
  const book = marketSpread != null ? line(pickLine(marketSpread, side)) : "—";
  const trackModel = fairSpread != null ? homeLine(fairSpread) : null;
  const trackMarket = marketSpread != null ? homeLine(marketSpread) : null;
  const lines = [sentences[0], SHOW_COVER_SENTENCE ? sentences[1] : null].filter(Boolean) as string[];
  return (
    <MarketBlock
      market="spread"
      pick={pick}
      ours={ours}
      book={book}
      needs={needsPct(chip?.price)}
      price={price(chip?.price)}
      edge={chip?.edge ?? null}
      sentences={lines}
      track={
        <GapTrack kind="line" model={trackModel} market={trackMarket} edge={chip?.edge} />
      }
    />
  );
}

function TotalRow({ chip, sentence }: { chip: Chip | null; sentence?: string }) {
  const pick = chip?.side === "under" ? "Under" : chip?.side === "over" ? "Over" : "—";
  return (
    <MarketBlock
      market="total"
      pick={pick}
      ours={pct(chip?.prob)}
      book={pct(chip?.market_prob)}
      needs={needsPct(chip?.price)}
      price={price(chip?.price)}
      edge={chip?.edge ?? null}
      sentences={sentence ? [sentence] : []}
      track={<GapTrack kind="prob" model={chip?.prob} market={chip?.market_prob} edge={chip?.edge} />}
    />
  );
}

function MoneylineRow({
  payload,
  liveEdges,
  sentence,
}: {
  payload: VerdictPayload;
  liveEdges?: BoardRow["edges"];
  sentence?: string;
}) {
  const home = overlayEdge(payloadSide(payload, "moneyline", "home"), liveEdges?.ml_home);
  const away = overlayEdge(payloadSide(payload, "moneyline", "away"), liveEdges?.ml_away);
  const useAway = (away?.edge ?? Number.NEGATIVE_INFINITY) > (home?.edge ?? Number.NEGATIVE_INFINITY);
  const row = useAway ? away : home;
  const pick = useAway ? payload.away : payload.home;
  return (
    <MarketBlock
      market="moneyline"
      pick={pick}
      ours={pct(row?.model_prob)}
      book={pct(row?.market_prob)}
      needs={needsPct(row?.price)}
      price={price(row?.price)}
      edge={row?.edge ?? null}
      sentences={sentence ? [sentence] : []}
      track={<GapTrack kind="prob" model={row?.model_prob} market={row?.market_prob} edge={row?.edge} />}
    />
  );
}

function MarketBlock({
  market,
  pick,
  ours,
  book,
  needs,
  price: priceText,
  edge,
  sentences,
  track,
}: {
  market: "spread" | "total" | "moneyline";
  pick: string;
  ours: string;
  book: string;
  needs: string;
  price: string;
  edge: number | null;
  sentences: string[];
  track: ReactNode;
}) {
  const dir = direction(edge);
  const inten = intensity(edge);
  return (
    <div className="border-b border-border py-2" data-market={market} data-edge={dir}>
      <div className={COLS}>
        <span className="t-body font-semibold text-foreground truncate">{pick}</span>
        <span className={cn("tnum t-body font-semibold text-foreground", GROUP_RAIL)}>{ours}</span>
        <span className="tnum t-body font-semibold text-line">{book}</span>
        <span className="tnum t-body font-semibold text-foreground">{needs}</span>
        <span className="flex justify-start">{track}</span>
        <span className={cn("tnum t-body font-semibold text-foreground", GROUP_RAIL)}>{priceText}</span>
        <EdgeDiff dir={dir} inten={inten} className="t-body">
          {signedPct(edge)}
        </EdgeDiff>
      </div>
      {sentences.map((s) => (
        <p key={s} className="mt-1 pl-1 t-sentence text-foreground" data-sentence="">
          {emphasize(s)}
        </p>
      ))}
    </div>
  );
}
