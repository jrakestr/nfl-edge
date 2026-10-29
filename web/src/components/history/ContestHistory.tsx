import { EmptyState } from "@/components/EmptyState";
import type { HistorySummary } from "@/lib/contest-history";
import { pct, signedPct } from "@/lib/edge";
import { MetricLabel, type Metric } from "@/lib/icons";
import type { HistoryOptions } from "@/lib/queries/contest-history";
import { CumulativeNet } from "./CumulativeNet";
import { HistoryTables } from "./HistoryTables";
import { NetBySeason } from "./NetBySeason";
import { RoiByBucket } from "./RoiByBucket";
import { dash, money, signedMoney } from "./format";

function Tile({
  metric,
  label,
  value,
  sub,
  valueClass,
}: {
  metric?: Metric;
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="card flex flex-col gap-1 p-4" role="listitem">
      <span className="t-colhead text-muted-foreground">
        {metric ? <MetricLabel metric={metric}>{label}</MetricLabel> : label}
      </span>
      <span className={`t-tile tnum ${valueClass ?? ""}`}>{value}</span>
      {sub ? <span className="t-caption text-muted-foreground">{sub}</span> : null}
    </div>
  );
}

export function ContestHistory({
  summary,
  sport = "NFL",
  gameType = "Classic",
  options,
}: {
  summary: HistorySummary;
  sport?: string;
  gameType?: string;
  options?: HistoryOptions;
}) {
  const { totals } = summary;
  const sports = options?.sports.length ? options.sports : ["NFL"];
  const typesForSport =
    sport === "all"
      ? [...new Set(Object.values(options?.gameTypesBySport ?? {}).flat())]
      : (options?.gameTypesBySport[sport] ?? ["Classic", "Showdown Captain Mode"]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <h1 className="t-title">Contest history</h1>
          <p className="t-caption text-muted-foreground">
            DraftKings contest entry history (place, points, winnings incl. tickets)
          </p>
        </div>
        <form method="get" action="/history" className="flex flex-wrap items-center gap-2" aria-label="History filters">
          <label className="flex items-center gap-1.5 t-caption text-muted-foreground">
            <span>Sport</span>
            <select
              name="sport"
              defaultValue={sport}
              aria-label="Sport"
              className="h-8 rounded-md border border-border bg-card px-2 t-body text-foreground"
            >
              {sports.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
              <option value="all">All sports</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5 t-caption text-muted-foreground">
            <span>Format</span>
            <select
              name="type"
              defaultValue={gameType}
              aria-label="Format"
              className="h-8 rounded-md border border-border bg-card px-2 t-body text-foreground"
            >
              <option value="all">All {sport === "all" ? "formats" : sport}</option>
              {typesForSport.map((gt) => (
                <option key={gt} value={gt}>
                  {gt}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="h-8 rounded-md border border-border bg-card px-3 t-body font-semibold text-foreground hover:bg-accent"
          >
            Apply
          </button>
        </form>
      </header>

      {totals.entries === 0 ? (
        <EmptyState title="No contest entries">
          No rows for {sport} · {gameType}. Export{" "}
          <code>draftkings-contest-entry-history.csv</code> and run{" "}
          <code>nfl-edge ingest dk-folder &lt;dir&gt;</code>.
        </EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6" role="list" aria-label="History summary tiles">
            <Tile label="Entries" value={totals.entries.toLocaleString("en-US")} sub={`${sport} · ${gameType}`} />
            <Tile metric="salary" label="Entry fees" value={money(totals.fees)} />
            <Tile
              metric="salary"
              label="Winnings"
              value={money(totals.winnings)}
              sub={totals.winningsTicket > 0 ? `incl. tickets (${money(totals.winningsTicket)})` : "incl. tickets"}
            />
            <Tile
              label="Net P/L"
              value={signedMoney(totals.net)}
              valueClass={totals.net > 0 ? "text-edge-pos" : totals.net < 0 ? "text-edge-neg" : undefined}
            />
            <Tile
              metric="roi"
              label="ROI"
              value={totals.roi == null ? dash : signedPct(totals.roi, 1)}
              valueClass={
                totals.roi != null && totals.roi > 0
                  ? "text-edge-pos"
                  : totals.roi != null && totals.roi < 0
                    ? "text-edge-neg"
                    : undefined
              }
            />
            <Tile
              metric="winPct"
              label="Cash rate"
              value={totals.cashRate == null ? dash : pct(totals.cashRate, 1)}
              sub={`${totals.cashed.toLocaleString("en-US")} cashed`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <NetBySeason rows={summary.bySeason} />
            <CumulativeNet rows={summary.bySeason} />
            <RoiByBucket rows={summary.byFee} />
          </div>

          <HistoryTables bySize={summary.bySize} topFinishes={summary.topFinishes} />
        </>
      )}
    </div>
  );
}
