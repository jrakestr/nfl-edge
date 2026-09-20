"use client";

import { EdgeCell } from "@/components/board/EdgeCell";
import { MarketPill } from "@/components/board/MarketPill";
import { Matchup } from "@/components/board/TeamDot";
import { DataTable } from "@/components/ui/DataTable";
import { homeLine, signed } from "@/lib/edge";
import { kickoffLabel } from "@/lib/format";
import { snapshotClvTitle, spreadCoverPrimary } from "@/lib/grade-select";
import type { GradedGame } from "@/lib/grade-types";

function coverCell(r: GradedGame) {
  const primary = spreadCoverPrimary(r.spreadHasPick, r.spreadOutcome);
  const call = r.spreadVerdictCall?.trim();
  const showCall = !r.spreadHasPick && call && !call.includes("_");
  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className="t-body font-semibold text-foreground">{primary}</span>
      {showCall ? <span className="t-caption text-muted-foreground">{call}</span> : null}
    </span>
  );
}

function clvCell(r: GradedGame) {
  const parts: { label: string; pts: number }[] = [];
  if (r.spreadClvPoints != null) parts.push({ label: "Spread", pts: r.spreadClvPoints });
  if (r.totalClvPoints != null) parts.push({ label: "Total", pts: r.totalClvPoints });
  return (
    <span className="flex flex-col items-end gap-0.5" title={snapshotClvTitle(r.snapshotCount)}>
      {parts.length === 0 ? (
        <span className="t-body tnum text-foreground">—</span>
      ) : (
        parts.map((p) => (
          <span key={p.label} className="t-body tnum text-foreground">
            <span className="t-caption text-muted-foreground">{p.label} </span>
            {signed(p.pts)}
          </span>
        ))
      )}
    </span>
  );
}

export function GradeTable({ games }: { games: GradedGame[] }) {
  return (
    <DataTable
      data={games}
      getRowId={(r) => r.gameId}
      empty="No graded weeks yet"
      ariaLabel="Graded edges"
      filters={{
        search: (r, q) =>
          `${r.away} ${r.home} ${r.week}`.toLowerCase().includes(q.toLowerCase()),
      }}
      searchPlaceholder="Filter by team or week"
      columns={[
        {
          id: "matchup",
          header: "Matchup",
          sortValue: (r) => `${r.week} ${r.away} ${r.home}`,
          cell: (r) => (
            <div className="flex items-center gap-3">
              <Matchup home={r.home} away={r.away} />
              <span className="flex flex-col gap-0.5">
                <span className="t-caption">Week {r.week}</span>
                <span className="t-caption">{kickoffLabel(r.gameday, r.gametime)}</span>
              </span>
            </div>
          ),
        },
        {
          id: "spread",
          header: "Spread",
          align: "right",
          sortValue: (r) => r.spreadEdge,
          cell: (r) => (
            <EdgeCell
              kind="spread"
              model={r.meanSpread != null ? homeLine(r.meanSpread) : null}
              market={r.spreadLine != null ? homeLine(r.spreadLine) : null}
              edge={r.spreadEdge}
            />
          ),
        },
        {
          id: "total",
          header: "Total",
          align: "right",
          sortValue: (r) => r.totalEdge,
          cell: (r) => (
            <EdgeCell kind="total" model={r.meanTotal} market={r.totalLine} edge={r.totalEdge} />
          ),
        },
        {
          id: "ml",
          header: "Home wins",
          align: "right",
          sortValue: (r) => r.mlEdge,
          cell: (r) => (
            <EdgeCell
              kind="prob"
              model={r.mlModelProb ?? r.homeWinProb}
              market={r.mlMarketProb}
              edge={r.mlEdge}
            />
          ),
        },
        {
          id: "cover",
          header: "Covers the book line",
          align: "right",
          sortValue: (r) => (r.spreadHasPick ? (r.spreadOutcome ?? -1) : -2),
          cell: (r) => coverCell(r),
        },
        {
          id: "market",
          header: "Market",
          sortable: false,
          cell: (r) => (
            <MarketPill
              home={r.home}
              away={r.away}
              spreadLine={r.spreadLine}
              homeSpreadOdds={r.homeSpreadOdds}
              awaySpreadOdds={r.awaySpreadOdds}
            />
          ),
        },
        {
          id: "actual",
          header: "Actual",
          align: "right",
          sortValue: (r) => r.scoreTotal,
          cell: (r) =>
            r.awayScore == null || r.homeScore == null ? (
              <span className="t-caption text-muted-foreground">—</span>
            ) : (
              <span className="flex flex-col items-end gap-0.5">
                <span className="t-body font-semibold text-foreground">
                  {r.away} {r.awayScore} – {r.home} {r.homeScore}
                </span>
                <span className="t-caption tnum text-foreground">
                  {r.result != null ? signed(r.result) : ""}
                  {r.result != null && r.scoreTotal != null ? " " : ""}
                  {r.scoreTotal != null ? r.scoreTotal : ""}
                </span>
              </span>
            ),
        },
        {
          id: "clv",
          header: "Line moved our way",
          align: "right",
          sortValue: (r) => r.spreadClvPoints ?? r.totalClvPoints,
          cell: (r) => clvCell(r),
        },
      ]}
    />
  );
}
