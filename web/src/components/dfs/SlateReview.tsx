"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { PositionPill } from "@/components/ui/PositionPill";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { pct } from "@/lib/edge";
import {
  chalk,
  contestRows,
  dash,
  drawerBreakdown,
  entryFor,
  fixed,
  lowOwnedHits,
  portfolio,
  signedFixed,
  topScorers,
  type ContestRow,
  type Portfolio,
  type ReviewContest,
  type ReviewData,
  type ReviewLineup,
  type ScorerRow,
} from "@/lib/review";
import { cn } from "@/lib/utils";

function money(n: number | null | undefined): string {
  return n == null ? dash : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="t-colhead text-muted-foreground">{label}</span>
      <span className="t-tile tnum font-semibold">{value}</span>
      {note ? <span className="t-caption text-muted-foreground">{note}</span> : null}
    </div>
  );
}

function PortfolioCard({
  p,
  total,
  contest,
}: {
  p: Portfolio;
  total: number;
  contest: ReviewContest | null;
}) {
  const diff = p.meanActual != null && p.meanProj != null ? p.meanActual - p.meanProj : null;
  return (
    <section className="card flex flex-col gap-4 p-4" aria-label="Portfolio">
      <h2 className="t-sentence font-semibold">Portfolio</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        <Stat label="Best" value={fixed(p.best, 2)} />
        <Stat label="Median" value={fixed(p.median, 2)} />
        <Stat label="Worst" value={fixed(p.worst, 2)} />
        <Stat label="Mean actual" value={fixed(p.meanActual, 2)} note={`${signedFixed(diff, 2)} vs projected`} />
        <Stat label="Mean projected" value={fixed(p.meanProj, 2)} />
        <Stat
          label="Top 1%"
          value={p.top1Count == null ? dash : String(p.top1Count)}
          note={contest ? `at or above ${fixed(contest.top1Score, 2)}` : "no contest file"}
        />
        <Stat
          label="Cash"
          value={p.cashCount == null ? dash : String(p.cashCount)}
          note={contest?.cashScore != null ? `at or above ${fixed(contest.cashScore, 2)}` : "no contest file"}
        />
      </div>
      <p className="t-caption text-muted-foreground">
        {p.graded} of {total} mass lineups graded
        {p.incomplete ? `, ${p.incomplete} incomplete (a slot has no actual)` : ""}
      </p>
    </section>
  );
}

const nameCell = (r: { name: string; position: string | null }) => (
  <span className="flex items-center gap-2 whitespace-nowrap">
    <PositionPill position={r.position} />
    <span>{r.name}</span>
  </span>
);

const CHALK_COLUMNS: DataColumn<ContestRow>[] = [
  { id: "name", header: "Player", sortValue: (r) => r.name, cell: nameCell },
  { id: "salary", header: "Salary", align: "right", sortValue: (r) => r.salary, cell: (r) => (r.salary == null ? dash : `$${r.salary.toLocaleString("en-US")}`), className: "tnum" },
  { id: "own", header: "Own%", align: "right", sortValue: (r) => r.own, cell: (r) => pct(r.own, 1), className: "tnum" },
  { id: "top1", header: "Top 1% rate", align: "right", sortValue: (r) => r.top1Rate, cell: (r) => pct(r.top1Rate, 1), className: "tnum" },
  { id: "pts", header: "Pts", align: "right", sortValue: (r) => r.pts, cell: (r) => fixed(r.pts, 2), className: "tnum" },
  { id: "ppk", header: "Pts/$", align: "right", sortValue: (r) => r.ptsPerK, cell: (r) => fixed(r.ptsPerK, 2), className: "tnum" },
];

const SCORER_COLUMNS: DataColumn<ScorerRow>[] = [
  { id: "name", header: "Player", sortValue: (r) => r.name, cell: nameCell },
  { id: "salary", header: "Salary", align: "right", sortValue: (r) => r.salary, cell: (r) => (r.salary == null ? dash : `$${r.salary.toLocaleString("en-US")}`), className: "tnum" },
  { id: "proj", header: "Proj", align: "right", sortValue: (r) => r.proj, cell: (r) => fixed(r.proj, 1), className: "tnum" },
  { id: "actual", header: "Actual", align: "right", sortValue: (r) => r.actual, cell: (r) => fixed(r.actual, 2), className: "tnum font-semibold" },
  { id: "own", header: "Own%", align: "right", sortValue: (r) => r.contestOwn, cell: (r) => pct(r.contestOwn, 1), className: "tnum" },
  { id: "ours", header: "Our exposure", align: "right", sortValue: (r) => r.ours, cell: (r) => pct(r.ours, 0), className: "tnum" },
  {
    id: "missed",
    header: "Missed",
    sortValue: (r) => (r.missed ? 1 : 0),
    cell: (r) => (r.missed ? <span className="font-semibold text-warn">Missed</span> : dash),
  },
];

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="t-sentence font-semibold">{title}</h2>
        {note ? <span className="t-caption text-muted-foreground">{note}</span> : null}
      </div>
      {children}
    </div>
  );
}

function ContestPicker({
  contests,
  active,
  hrefFor,
}: {
  contests: ReviewContest[];
  active: ReviewContest | null;
  hrefFor: (key: number) => string;
}) {
  if (contests.length < 2) return null;
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Contest">
      {contests.map((c) => (
        <Link
          key={c.key}
          href={hrefFor(c.key)}
          aria-current={active?.key === c.key ? "page" : undefined}
          className={cn(
            "rounded-md border px-2 py-1 t-caption",
            active?.key === c.key ? "border-foreground font-semibold" : "border-border text-muted-foreground",
          )}
        >
          {c.name ?? `Contest ${c.key}`} · {c.entries.toLocaleString("en-US")} entries
        </Link>
      ))}
    </nav>
  );
}

const LIMITS: (number | null)[] = [10, 25, 50, null];

function lineupColumns(contest: ReviewContest | null): DataColumn<ReviewLineup>[] {
  return [
    { id: "id", header: "Lineup", sortValue: (r) => Number(r.id), cell: (r) => `#${r.id}`, className: "tnum" },
    { id: "stack", header: "Stack", sortValue: (r) => r.stack ?? "", cell: (r) => r.stack ?? dash },
    { id: "proj", header: "Proj", align: "right", sortValue: (r) => r.proj, cell: (r) => fixed(r.proj, 1), className: "tnum" },
    { id: "actual", header: "Actual", align: "right", sortValue: (r) => r.actual, cell: (r) => fixed(r.actual, 2), className: "tnum font-semibold" },
    {
      id: "diff",
      header: "Diff",
      align: "right",
      sortValue: (r) => (r.actual != null && r.proj != null ? r.actual - r.proj : null),
      cell: (r) => signedFixed(r.actual != null && r.proj != null ? r.actual - r.proj : null, 1),
      className: "tnum",
    },
    { id: "win", header: "Sim win %", align: "right", sortValue: (r) => r.winPct, cell: (r) => pct(r.winPct, 1), className: "tnum" },
    {
      id: "rank",
      header: "Contest rank",
      align: "right",
      sortValue: (r) => entryFor(r, contest?.key ?? null)?.rank ?? null,
      cell: (r) => {
        const e = entryFor(r, contest?.key ?? null);
        return e ? e.rank.toLocaleString("en-US") : dash;
      },
      className: "tnum",
    },
  ];
}

function LineupDrawer({
  lineup,
  data,
  onClose,
}: {
  lineup: ReviewLineup | null;
  data: ReviewData;
  onClose: () => void;
}) {
  const loaded = data.contest != null && data.contestPlayers.length > 0;
  const breakdown = useMemo(
    () => (lineup ? drawerBreakdown(lineup, data.facts, loaded ? data.contestPlayers : null) : null),
    [lineup, data.facts, data.contestPlayers, loaded],
  );
  const entry = lineup ? entryFor(lineup, data.contest?.key ?? null) : null;
  return (
    <Sheet open={lineup != null} onOpenChange={(o) => (o ? undefined : onClose())}>
      <SheetContent side="right" className="gap-0 overflow-y-auto p-0 data-[side=right]:sm:max-w-5xl w-full">
        {lineup && breakdown ? (
          <>
            <SheetHeader className="border-b border-border-soft p-6 pb-4">
              <SheetTitle className="t-title">Lineup #{lineup.id}</SheetTitle>
              <SheetDescription className="t-caption flex flex-wrap gap-x-4 gap-y-1">
                <span className="tnum">Proj {fixed(lineup.proj, 1)}</span>
                <span className="tnum">Actual {fixed(lineup.actual, 2)}</span>
                {entry ? (
                  <span className="tnum">
                    Entry rank {entry.rank.toLocaleString("en-US")} · {fixed(entry.points, 2)} pts
                    {entry.winnings != null ? ` · ${money(entry.winnings)}` : ""}
                  </span>
                ) : null}
              </SheetDescription>
            </SheetHeader>
            <div className="flex flex-col gap-3 p-6">
              <div className="card overflow-x-auto">
                <table className="w-full caption-bottom t-body" aria-label="Lineup slots">
                  <thead className="bg-muted">
                    <tr className="text-left t-colhead text-muted-foreground">
                      {[
                        "Slot",
                        "Player",
                        "Contest FPTS",
                        "Sim Top 1%",
                        "Leverage",
                        "Leverage vs contest",
                        "Std dev",
                        "Boom",
                        "Bust",
                        "DK ceiling",
                        "DK floor",
                      ].map((h, i) => (
                        <th key={h} className={cn("px-3 py-2 font-medium", i > 1 && "text-right")}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.slots.map((s) => (
                      <tr key={`${s.slot}-${s.name}`} className="border-t border-border-soft">
                        <td className="px-3 py-2">{s.slot}</td>
                        <td className="px-3 py-2">{nameCell({ name: s.name, position: s.position })}</td>
                        <td className="tnum px-3 py-2 text-right font-semibold">{fixed(s.fpts, 2)}</td>
                        <td className="tnum px-3 py-2 text-right">{pct(s.top1Pct, 1)}</td>
                        <td className="tnum px-3 py-2 text-right">{s.leverage == null ? dash : signedFixed(s.leverage * 100, 1) + "%"}</td>
                        <td className="tnum px-3 py-2 text-right">
                          {s.contestLeverage == null ? dash : signedFixed(s.contestLeverage * 100, 1) + "%"}
                        </td>
                        <td className="tnum px-3 py-2 text-right">{fixed(s.sd, 1)}</td>
                        <td className="tnum px-3 py-2 text-right">{pct(s.boom, 0)}</td>
                        <td className="tnum px-3 py-2 text-right">{pct(s.bust, 0)}</td>
                        <td className="tnum px-3 py-2 text-right">{fixed(s.ceiling, 1)}</td>
                        <td className="tnum px-3 py-2 text-right">{fixed(s.floor, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border">
                      <td className="px-3 py-2 font-semibold" colSpan={2}>
                        Total
                      </td>
                      <td className="tnum px-3 py-2 text-right font-semibold">{fixed(breakdown.total, 2)}</td>
                      <td colSpan={8} />
                    </tr>
                  </tfoot>
                </table>
              </div>
              {!loaded ? (
                <p className="t-caption text-muted-foreground">No contest file loaded for this slate. Contest FPTS stay empty.</p>
              ) : breakdown.missing.length ? (
                <p className="t-caption text-warn" role="note">
                  No contest FPTS for {breakdown.missing.join(", ")}. The breakdown is withheld.
                </p>
              ) : entry && entry.points != null && breakdown.total != null && Math.abs(entry.points - breakdown.total) > 0.05 ? (
                <p className="t-caption text-warn" role="note">
                  Slot total {fixed(breakdown.total, 2)} differs from entry points {fixed(entry.points, 2)}.
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** Post-slate review. `data` is null when scores are unpublished: empty state, no partial panels. */
export function SlateReview({
  data,
  week,
  site,
  slate,
  latestWeek,
}: {
  data: ReviewData | null;
  week: number | string;
  site: string;
  slate: string;
  /** Newest week with a graded review. Offered from the empty state. */
  latestWeek?: number | null;
}) {
  const [open, setOpen] = useState<ReviewLineup | null>(null);
  const [limit, setLimit] = useState<number | null>(10);
  const contest = data?.contest ?? null;
  const loaded = data != null && contest != null && data.contestPlayers.length > 0;

  const summary = useMemo(() => (data ? portfolio(data.lineups, loaded ? contest : null) : null), [data, contest, loaded]);
  const rows = useMemo(() => (data && loaded ? contestRows(data.contestPlayers, data.facts) : []), [data, loaded]);
  const chalkRows = useMemo(() => chalk(rows), [rows]);
  const lowRows = useMemo(() => lowOwnedHits(rows), [rows]);
  const scorerRows = useMemo(
    () => (data ? topScorers(data.facts, loaded ? data.contestPlayers : [], data.lineups) : []),
    [data, loaded],
  );
  const lineupCols = useMemo(() => lineupColumns(loaded ? contest : null), [contest, loaded]);

  const base = `/week/${week}/dfs/${site}/${slate}`;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="t-title">
          Week {week} · {site.toUpperCase()} · {slate} review
        </h1>
        <Link href={base} className="t-body text-muted-foreground underline-offset-2 hover:underline">
          Back to lineups
        </Link>
      </header>
      {!data || !summary ? (
        <EmptyState title="Scores unpublished">
          No graded lineups for this slate yet. The review fills in after the week&apos;s scores are published and grading runs.
          {latestWeek != null && String(latestWeek) !== String(week) ? (
            <>
              {" "}
              <Link href={`/week/${latestWeek}/dfs/${site}/main/review`} className="underline underline-offset-2">
                Open week {latestWeek} review
              </Link>
            </>
          ) : null}
        </EmptyState>
      ) : (
        <>
          <ContestPicker
            contests={data.contests}
            active={contest}
            hrefFor={(key) => `${base}/review?contest=${key}`}
          />
          <PortfolioCard p={summary} total={data.totalLineups} contest={loaded ? contest : null} />
          {loaded ? (
            <>
              <Panel title="Chalk" note="Most-owned players in the contest">
                <DataTable
                  data={chalkRows}
                  columns={CHALK_COLUMNS}
                  getRowId={(r) => r.name}
                  empty="No contest players."
                  ariaLabel="Chalk"
                  syncUrl={false}
                  defaultSort={{ id: "own", dir: "desc" }}
                />
              </Panel>
              <Panel title="Low-owned hits" note="Under 10% owned and at least 3 points per $1k">
                <DataTable
                  data={lowRows}
                  columns={CHALK_COLUMNS}
                  getRowId={(r) => r.name}
                  empty="No low-owned hits."
                  ariaLabel="Low-owned hits"
                  syncUrl={false}
                  defaultSort={{ id: "pts", dir: "desc" }}
                />
              </Panel>
            </>
          ) : (
            <EmptyState title="No contest file for this slate">
              Chalk, Low-owned hits, and the contest Top 1% rate stay empty until a DraftKings standings file is ingested.
            </EmptyState>
          )}
          <Panel title="Top scorers" note="Highest actual DK points on the slate">
            <DataTable
              data={scorerRows}
              columns={SCORER_COLUMNS}
              getRowId={(r) => r.name}
              empty="No actuals."
              ariaLabel="Top scorers"
              syncUrl={false}
              defaultSort={{ id: "actual", dir: "desc" }}
            />
          </Panel>
          <Panel
            title="Lineups"
            note={`Select a lineup for its nine slots. Showing ${Math.min(limit ?? data.lineups.length, data.lineups.length)} of ${data.lineups.length}`}
          >
            <nav className="flex flex-wrap items-center gap-2" aria-label="Lineups shown">
              <span className="t-caption text-muted-foreground">Show</span>
              {LIMITS.map((n) => (
                <button
                  key={String(n)}
                  type="button"
                  onClick={() => setLimit(n)}
                  aria-pressed={limit === n}
                  className={cn(
                    "rounded-md border px-2 py-1 t-caption",
                    limit === n ? "border-foreground font-semibold" : "border-border text-muted-foreground",
                  )}
                >
                  {n ?? "All"}
                </button>
              ))}
            </nav>
            <DataTable
              rowLimit={limit ?? undefined}
              data={data.lineups}
              columns={lineupCols}
              getRowId={(r) => r.id}
              empty="No lineups."
              ariaLabel="Lineups"
              syncUrl={false}
              defaultSort={{ id: "actual", dir: "desc" }}
              onRowClick={(r) => setOpen(r)}
              rowProps={() => ({ className: "cursor-pointer" })}
            />
          </Panel>
          <LineupDrawer lineup={open} data={data} onClose={() => setOpen(null)} />
        </>
      )}
    </div>
  );
}
