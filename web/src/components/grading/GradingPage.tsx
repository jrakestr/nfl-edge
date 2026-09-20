import Link from "next/link";
import { GradeTable } from "@/components/grading/GradeTable";
import { CURRENT_SEASON } from "@/lib/config";
import { signedPct } from "@/lib/edge";
import type { CalBucket, GradedGame } from "@/lib/grade-types";
import { MetricLabel, type Metric } from "@/lib/icons";
import type { TrackRecord } from "@/lib/queries/results";
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
  sub?: string;
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

function wlp(w: number, l: number, p: number): string {
  return `${w}–${l}–${p}`;
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
  weekFilter = null,
  marketFilter = null,
  season = 2026,
}: {
  track?: TrackRecord;
  games?: GradedGame[];
  buckets?: CalBucket[];
  weeks?: number[];
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

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="t-title">Grading</h1>
        <p className="mt-1 t-caption">
          Same table as the Edge board, with Actual after the games. Flat ROI is the headline until
          ten graded weeks.
        </p>
      </header>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-5" role="list" aria-label="Track record">
        <Tile
          label="Record"
          value={record}
          sub={empty ? "No graded weeks yet" : `${track.gradedWeeks} graded week${track.gradedWeeks === 1 ? "" : "s"}`}
        />
        <Tile
          metric="roi"
          label="Flat ROI"
          value={roi}
          sub={[kelly, "Headline until ten weeks"].filter(Boolean).join(" ")}
        />
        <Tile label="Sides" value={sides} />
        <Tile label="Totals" value={totals} />
        <Tile label="Moneyline" value={moneyline} />
      </div>
      {weeks.length > 1 ? (
        <nav className="flex flex-wrap items-center gap-2" aria-label="Week">
          <Link
            href={href(season, null, marketFilter)}
            className={cn("t-caption", weekFilter == null ? "font-semibold text-foreground" : "text-muted-foreground")}
          >
            All weeks
          </Link>
          {weeks.map((w) => (
            <Link
              key={w}
              href={href(season, w, marketFilter)}
              className={cn("t-caption", weekFilter === w ? "font-semibold text-foreground" : "text-muted-foreground")}
            >
              Week {w}
            </Link>
          ))}
        </nav>
      ) : null}
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
            <table className="mt-3 w-full">
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
