"use client";

import { EmptyState } from "@/components/EmptyState";
import { PaceFigure } from "@/components/league/PaceFigure";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { shortStamp } from "@/lib/format";
import { espnStatusLabel, seasonShare, slotLabel, type RosterRow } from "@/lib/league";

/** Current roster as of the last ESPN pull. Status is the pull-time status, not a pre-kickoff claim. */
export function RosterTable({
  rows,
  weeksDone,
  seasonWeeks,
  rankingsPulledAt,
}: {
  rows: RosterRow[];
  weeksDone: number;
  seasonWeeks: number;
  rankingsPulledAt: string | null;
}) {
  if (rows.length === 0) {
    return <EmptyState title="No roster stored">Run nfl-edge ingest espn-league to load rosters.</EmptyState>;
  }
  const pulled = rows[0]!.pulled_at;
  const columns: DataColumn<RosterRow>[] = [
    { id: "slot", header: "Slot", sortValue: (r) => slotLabel(r.slot), cell: (r) => slotLabel(r.slot), className: "t-body" },
    {
      id: "player",
      header: "Player",
      sortValue: (r) => r.player,
      className: "t-body",
      cell: (r) => (
        <>
          <span className="font-semibold">{r.player}</span>{" "}
          <span className="t-caption">{[r.position, r.nfl_team].filter(Boolean).join(" ")}</span>
        </>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortValue: (r) => espnStatusLabel(r.status_at_pull) ?? "Healthy",
      cell: (r) => espnStatusLabel(r.status_at_pull) ?? "Healthy",
      className: "t-body",
    },
    {
      id: "pts",
      header: "Season pts",
      align: "right",
      sortValue: (r) => r.season_pts,
      className: "t-body tnum",
      cell: (r) => (r.season_pts != null ? r.season_pts.toFixed(1) : "—"),
    },
    {
      id: "ros",
      header: "ROS rk",
      align: "right",
      sortValue: (r) => r.fp_rank,
      className: "t-body tnum",
      cell: (r) => (r.fp_rank != null ? String(r.fp_rank) : "—"),
    },
    {
      id: "proj",
      header: "Season proj",
      align: "right",
      sortValue: (r) => r.season_proj,
      className: "t-body tnum",
      cell: (r) => (r.season_proj != null ? r.season_proj.toFixed(1) : "—"),
    },
    {
      id: "share",
      header: "Pts / proj",
      align: "right",
      sortValue: (r) => seasonShare(r.season_pts, r.season_proj),
      className: "t-body",
      cell: (r) => <PaceFigure pts={r.season_pts} proj={r.season_proj} weeksDone={weeksDone} seasonWeeks={seasonWeeks} />,
    },
  ];
  return (
    <section className="flex flex-col gap-2" aria-label="Roster">
      <h2 className="t-body font-semibold">Roster</h2>
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => `${r.slot}:${r.player}`}
        ariaLabel="Roster"
        empty="No roster stored"
        syncUrl={false}
      />
      <p className="t-caption">
        Pts / proj is season points divided by ESPN&apos;s season projection. Color is points versus pace:
        projection times {weeksDone} completed {weeksDone === 1 ? "week" : "weeks"} over the {seasonWeeks || "—"}-week
        season. Status as of the ESPN pull {shortStamp(pulled)} ET. ROS rk is FantasyPros rest-of-season PPR.{" "}
        {rankingsPulledAt
          ? `Pulled ${shortStamp(rankingsPulledAt)} ET.`
          : "Run nfl-edge ingest fantasypros-rankings."}
      </p>
    </section>
  );
}
