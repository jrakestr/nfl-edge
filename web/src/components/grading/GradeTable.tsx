"use client";

import { EdgeCell } from "@/components/board/EdgeCell";
import { MarketPill } from "@/components/board/MarketPill";
import { Matchup } from "@/components/board/TeamDot";
import { DataTable } from "@/components/ui/DataTable";
import { homeLine, signed } from "@/lib/edge";
import { kickoffLabel } from "@/lib/format";
import { outcomeLabel } from "@/lib/grade-select";
import type { GradedGame } from "@/lib/grade-types";

function coverCell(r: GradedGame): string {
  const call = r.spreadVerdictCall?.trim();
  if (call && !call.includes("_")) return call;
  return outcomeLabel(r.spreadOutcome);
}

function clvCell(r: GradedGame): string {
  const parts: string[] = [];
  if (r.spreadClvPoints != null) parts.push(signed(r.spreadClvPoints));
  if (r.totalClvPoints != null) parts.push(signed(r.totalClvPoints));
  return parts.length ? parts.join(" ") : "—";
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
          sortValue: (r) => r.spreadOutcome,
          cell: (r) => <span className="t-body font-semibold text-foreground">{coverCell(r)}</span>,
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
          header: "CLV points",
          align: "right",
          sortValue: (r) => r.spreadClvPoints ?? r.totalClvPoints,
          cell: (r) => <span className="t-body tnum text-foreground">{clvCell(r)}</span>,
        },
      ]}
    />
  );
}
