"use client";

import { Delta } from "@/components/league/Delta";
import { TeamLink } from "@/components/league/TeamLink";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { recordLabel, viewerRow, type StandingRow } from "@/lib/league";

/** Standings: record, points for and against, and actual minus ESPN's projection. */
export function StandingsTable({ rows, season }: { rows: StandingRow[]; season: number }) {
  const ranked = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  const columns: DataColumn<(typeof ranked)[number]>[] = [
    { id: "rank", header: "#", sortValue: (r) => r.rank, cell: (r) => <span className="tnum">{r.rank}</span> },
    {
      id: "team",
      header: "Team",
      sortValue: (r) => r.team,
      cell: (r) => (
        <span className="flex flex-col">
          <TeamLink id={r.espn_team_id} name={r.team} season={season} />
          <span className="t-caption">{r.owner}</span>
        </span>
      ),
    },
    {
      id: "record",
      header: "Record",
      align: "right",
      sortValue: (r) => r.wins + r.ties / 2,
      cell: (r) => <span className="tnum font-semibold">{recordLabel(r.wins, r.losses, r.ties)}</span>,
    },
    { id: "pf", header: "Points for", align: "right", sortValue: (r) => r.pf, cell: (r) => <span className="tnum">{r.pf.toFixed(1)}</span> },
    { id: "pa", header: "Points against", align: "right", sortValue: (r) => r.pa, cell: (r) => <span className="tnum">{r.pa.toFixed(1)}</span> },
    { id: "proj", header: "Projected for", align: "right", sortValue: (r) => r.proj_pf, cell: (r) => <span className="tnum">{r.proj_pf.toFixed(1)}</span> },
    { id: "pm", header: "Actual vs projected", align: "right", sortValue: (r) => r.plus_minus, cell: (r) => <Delta value={r.plus_minus} /> },
    {
      id: "allplay",
      header: "All-play",
      align: "right",
      sortValue: (r) => r.allplay_wins,
      cell: (r) => <span className="tnum">{`${r.allplay_wins}–${r.allplay_losses}`}</span>,
    },
    {
      id: "back",
      header: "Back of top scorer",
      align: "right",
      sortValue: (r) => r.pts_back_of_pf_leader,
      cell: (r) => <span className="tnum">{r.pts_back_of_pf_leader === 0 ? "—" : r.pts_back_of_pf_leader.toFixed(1)}</span>,
    },
  ];
  return (
    <DataTable
      data={ranked}
      columns={columns}
      getRowId={(r) => String(r.espn_team_id)}
      ariaLabel="League standings"
      empty="No league data for this season yet. Run nfl-edge ingest espn-league."
      syncUrl={false}
      defaultSort={{ id: "rank", dir: "asc" }}
      rowProps={(r) => viewerRow(r.espn_team_id)}
    />
  );
}
