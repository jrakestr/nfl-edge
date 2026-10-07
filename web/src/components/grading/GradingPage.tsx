import Link from "next/link";
import { GradeTable } from "@/components/grading/GradeTable";
import { NgsCompare } from "@/components/grading/NgsCompare";
import { PlayerBias } from "@/components/grading/PlayerBias";
import { CURRENT_SEASON } from "@/lib/config";
import { signed, signedPct } from "@/lib/edge";
import { marginAccuracy, type ErrorPair } from "@/lib/margin-accuracy";
import type { CalBucket, GradedGame } from "@/lib/grade-types";
import { MetricLabel, type Metric } from "@/lib/icons";
import type { SiteCompare } from "@/lib/ngs-compare";
import type { PlayerBiasData } from "@/lib/player-bias";
import type { TrackRecord, WeekPicks } from "@/lib/queries/results";
import { cn } from "@/lib/utils";

function Tile({
  metric,
  label,
  value,
  sub,
}: {
  metric?: Metric;
  label: string;
  value: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col gap-1 p-4" role="listitem">
      <span className="t-colhead text-muted-foreground">
        {metric ? <MetricLabel metric={metric}>{label}</MetricLabel> : label}
      </span>
      <span className="t-tile tnum">{value}</span>
      {sub ? <span className="t-caption">{sub}</span> : null}
    </div>
  );
}

/** Our average miss next to the book's on the same games. Smaller is better. */
function ErrorTile({ label, pair }: { label: string; pair: ErrorPair | null }) {
  if (!pair) return <Tile label={label} value="—" />;
  const diff = pair.model - pair.book;
  const even = Math.abs(diff) < 0.05;
  return (
    <Tile
      label={label}
      value={pair.model.toFixed(1)}
      sub={
        <span className="flex flex-col">
          <span>
            Book <span className="font-semibold text-line tnum">{pair.book.toFixed(1)}</span>
          </span>
          <span
            className={cn(
              "font-semibold tnum",
              even ? "text-muted-foreground" : diff < 0 ? "text-edge-pos" : "text-edge-neg",
            )}
          >
            {even ? "Even with the book" : `${Math.abs(diff).toFixed(1)} ${diff < 0 ? "closer" : "farther"}`}
          </span>
        </span>
      }
    />
  );
}

function wlp(w: number, l: number, p: number): string {
  return `${w}–${l}–${p}`;
}

/** Share of decided picks that won; pushes are not decided. */
export function pickAccuracy(w: { wins: number; losses: number }): string {
  const n = w.wins + w.losses;
  return n === 0 ? "—" : `${Math.round((w.wins / n) * 100)}%`;
}

/** Right over games counted, one decimal like the NFLGameSim page (62.5%). */
function share(c: { right: number; n: number }): string {
  return c.n === 0 ? "—" : `${((c.right / c.n) * 100).toFixed(1)}%`;
}

function href(season: number, week: number | null, cal: string | null): string {
  const q = new URLSearchParams();
  if (season !== CURRENT_SEASON) q.set("season", String(season));
  if (week != null) q.set("week", String(week));
  if (cal && cal !== "all") q.set("cal", cal);
  const s = q.toString();
  return s ? `/grading?${s}` : "/grading";
}

export function GradingPage({
  track,
  games = [],
  buckets = [],
  weeks = [],
  weekly = [],
  finalByWeek = {},
  ngs,
  playerBias,
  weekFilter = null,
  marketFilter = null,
  season = 2026,
}: {
  track?: TrackRecord;
  games?: GradedGame[];
  buckets?: CalBucket[];
  weeks?: number[];
  weekly?: WeekPicks[];
  /** Finished REG games per week, graded or not. */
  finalByWeek?: Record<number, number>;
  /** Our metrics next to the NFLGameSim page's, for the selected week. */
  ngs?: SiteCompare;
  /** Projected against actual DK points per player, from the persisted bias cells. */
  playerBias?: PlayerBiasData;
  weekFilter?: number | null;
  marketFilter?: string | null;
  season?: number;
}) {
  const empty = !track || track.gradedWeeks === 0;
  const record = empty ? "—" : wlp(track.wins, track.losses, track.pushes);
  const roi = empty || track.roi == null ? "—" : signedPct(track.roi);
  const kelly = !empty && track.kellyRoi != null ? `Kelly ${signedPct(track.kellyRoi)}` : null;
  const sides = empty ? "—" : wlp(track.sides.wins, track.sides.losses, track.sides.pushes);
  const totals = empty ? "—" : wlp(track.totals.wins, track.totals.losses, track.totals.pushes);
  const moneyline = empty
    ? "—"
    : wlp(track.moneyline.wins, track.moneyline.losses, track.moneyline.pushes);
  const shown = weekFilter == null ? games : games.filter((g) => g.week === weekFilter);
  const nBuckets = buckets.reduce((s, b) => s + b.n, 0);
  const acc = marginAccuracy(empty ? [] : shown);
  const finishedInScope =
    weekFilter == null
      ? Object.values(finalByWeek).reduce((a, b) => a + b, 0)
      : (finalByWeek[weekFilter] ?? 0);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="t-title">Grading</h1>
        <p className="mt-1 t-caption">
          Same table as the Edge board, with Actual after the games. Flat ROI is the headline until
          ten graded weeks.
        </p>
      </header>
      <div className="flex flex-col gap-2">
        <h2 className="t-body font-semibold">Bets the model flagged</h2>
        <p className="t-caption">
          Every pick where the model beat the posted price. Record = Spread + Total + Moneyline bets,
          each shown as wins–losses–pushes.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6" role="list" aria-label="Track record">
        <Tile
          label={weekFilter == null ? "All bets" : `Week ${weekFilter} record`}
          value={record}
          sub={
            empty
              ? "No graded weeks yet"
              : weekFilter != null
                ? "All bet types, this week only"
                : `${track.gradedWeeks} graded week${track.gradedWeeks === 1 ? "" : "s"}`
          }
        />
        <Tile
          label="Bet win rate"
          value={empty ? "—" : pickAccuracy(track)}
          sub={empty ? undefined : `${track.wins} of ${track.wins + track.losses} bets won`}
        />
        <Tile
          metric="roi"
          label="Flat ROI"
          value={roi}
          sub={[kelly, "Headline until ten weeks"].filter(Boolean).join(" ")}
        />
        <Tile
          label="Spread bets"
          value={sides}
          sub={empty ? undefined : `${pickAccuracy(track.sides)} won`}
        />
        <Tile
          label="Total bets"
          value={totals}
          sub={empty ? undefined : `${pickAccuracy(track.totals)} won`}
        />
        <Tile
          label="Moneyline bets"
          value={moneyline}
          sub={empty ? undefined : `${pickAccuracy(track.moneyline)} won`}
        />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="t-body font-semibold">Every game, bet or not</h2>
        <p className="t-caption">
          Pick accuracy asks who won. Beat the spread asks who covered the line. Neither depends on
          whether the model flagged a bet.
        </p>
        <div
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6"
          role="list"
          aria-label="Margin accuracy"
        >
          <Tile
            label="Pick accuracy"
            value={share(acc.pick)}
            sub={acc.pick.n === 0 ? undefined : `${acc.pick.right} of ${acc.pick.n} games, winner only`}
          />
          <Tile
            label="Margin within 7 pts"
            value={share(acc.within7)}
            sub={acc.within7.n === 0 ? undefined : `${acc.within7.right} of ${acc.within7.n} games`}
          />
          <Tile
            label="Beat the spread"
            value={share(acc.ats)}
            sub={
              acc.ats.n === 0
                ? undefined
                : `${acc.ats.right} of ${acc.ats.n} games vs the line${acc.ats.pushes ? `, ${acc.ats.pushes} push` : ""}`
            }
          />
          <ErrorTile label="Margin miss, points" pair={acc.margin} />
          <ErrorTile label="Total miss, points" pair={acc.total} />
          <Tile
            label="Margin lean"
            value={acc.bias == null ? "—" : signed(acc.bias)}
            sub={
              acc.bias == null
                ? undefined
                : Math.abs(acc.bias) < 0.05
                  ? "No lean"
                  : acc.bias > 0
                    ? "Too high on the home team"
                    : "Too high on the away team"
            }
          />
        </div>
        {!empty && finishedInScope > 0 ? (
          <p className="t-caption" aria-label="Games counted">
            {acc.pick.n === finishedInScope
              ? `All ${finishedInScope} finished games counted, every game rather than only the bets.`
              : `${acc.pick.n} of ${finishedInScope} finished games counted. A game with no run before kickoff is not graded.`}
          </p>
        ) : null}
      </div>
      {weeks.length > 1 ? (
        <nav className="flex flex-wrap items-center gap-2" aria-label="Week">
          <Link
            href={href(season, null, marketFilter)}
            className={cn("t-caption", weekFilter == null ? "font-semibold text-foreground" : "text-muted-foreground")}
          >
            All weeks
          </Link>
          {weeks.map((w) => {
            const picks = weekly.find((p) => p.week === w);
            return (
              <Link
                key={w}
                href={href(season, w, marketFilter)}
                aria-current={weekFilter === w ? "page" : undefined}
                className={cn("t-caption", weekFilter === w ? "font-semibold text-foreground" : "text-muted-foreground")}
              >
                Week {w}
                {picks ? ` ${pickAccuracy(picks)}` : ""}
              </Link>
            );
          })}
        </nav>
      ) : null}
      {ngs && !empty ? <NgsCompare compare={ngs} week={weekFilter} /> : null}
      {playerBias && !empty ? <PlayerBias data={playerBias} gradedWeeks={weeks} /> : null}
      <GradeTable games={empty ? [] : shown} />
      <section className="card p-4">
        <h2 className="t-body font-semibold">Calibration</h2>
        {empty || nBuckets === 0 ? (
          <p className="mt-3 t-caption">No graded lines yet.</p>
        ) : (
          <>
            <nav className="mt-3 flex flex-wrap gap-2" aria-label="Market">
              {(["all", "spread", "total", "moneyline"] as const).map((m) => (
                <Link
                  key={m}
                  href={href(season, weekFilter, m)}
                  className={cn(
                    "t-caption",
                    (marketFilter ?? "all") === m ? "font-semibold text-foreground" : "text-muted-foreground",
                  )}
                >
                  {m === "all" ? "All markets" : m === "moneyline" ? "Moneyline" : m === "spread" ? "Spread" : "Total"}
                </Link>
              ))}
            </nav>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="t-colhead px-3 py-2 text-left text-muted-foreground">Bucket</th>
                    <th className="t-colhead px-3 py-2 text-right text-muted-foreground">Lines</th>
                    <th className="t-colhead px-3 py-2 text-right text-muted-foreground">Hit rate</th>
                  </tr>
                </thead>
                <tbody>
                  {buckets.map((b) => (
                    <tr key={`${b.lo}-${b.hi}`} className="border-b border-border-soft">
                      <td className="t-body px-3 py-2">
                        {Math.round(b.lo * 100)}–{Math.round(b.hi * 100)}%
                      </td>
                      <td className="t-body tnum px-3 py-2 text-right">{b.n}</td>
                      <td className="t-body tnum px-3 py-2 text-right">
                        {b.hitRate == null ? "—" : `${Math.round(b.hitRate * 100)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 t-caption">
              Every graded line (home side, or over on totals), not just the bets. One week makes
              most buckets small — the counts are the story, not a curve. Monotone against the close
              is a season-long target, not a sim build gate.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
