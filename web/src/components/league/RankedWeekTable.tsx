"use client";

import { Delta } from "@/components/league/Delta";
import { TeamLink } from "@/components/league/TeamLink";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { viewerRow, type LeagueTeamWeek } from "@/lib/league";

/** One week, every team ranked by score, with distance from the league average in standard deviations. */
export function RankedWeekTable({ rows, season }: { rows: LeagueTeamWeek[]; season: number }) {
  const first = rows[0];
  const columns: DataColumn<LeagueTeamWeek>[] = [
    { id: "rank", header: "#", sortValue: (r) => r.week_rank, cell: (r) => <span className="tnum">{r.is_final ? r.week_rank : "—"}</span> },
    {
      id: "team",
      header: "Team",
      sortValue: (r) => r.team,
      cell: (r) => <TeamLink id={r.espn_team_id} name={r.team} season={season} />,
    },
    { id: "score", header: "Score", align: "right", sortValue: (r) => (r.is_final ? r.actual_pts : null), cell: (r) => <span className="tnum font-semibold">{r.is_final ? r.actual_pts.toFixed(1) : "—"}</span> },
    { id: "proj", header: "Projected", align: "right", sortValue: (r) => r.proj_pts, cell: (r) => <span className="tnum">{r.proj_pts.toFixed(1)}</span> },
    { id: "pm", header: "Vs projected", align: "right", sortValue: (r) => (r.is_final ? r.own_pm : null), cell: (r) => (r.is_final ? <Delta value={r.own_pm} /> : <span className="text-muted-foreground">—</span>) },
    { id: "luck", header: "Luck", align: "right", sortValue: (r) => r.luck, cell: (r) => <Delta value={r.luck} kind="wins" digits={2} /> },
    {
      id: "sd",
      header: "Vs league avg",
      align: "right",
      sortValue: (r) => (r.is_final ? r.sd_from_avg : null),
      cell: (r) =>
        r.is_final && r.sd_from_avg != null ? (
          <span className="tnum">
            <Delta value={r.sd_from_avg} digits={2} className="font-semibold" /> <span className="t-caption">SD</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { id: "allplay", header: "All-play", align: "right", sortValue: (r) => r.allplay_wins, cell: (r) => <span className="tnum">{r.is_final ? `${r.allplay_wins}–${r.allplay_losses}` : "—"}</span> },
    { id: "pfrank", header: "Season rank", align: "right", sortValue: (r) => r.cum_pf_rank, cell: (r) => <span className="tnum">{r.cum_pf_rank}</span> },
    { id: "back", header: "Back of top scorer", align: "right", sortValue: (r) => r.pts_back_of_pf_leader, cell: (r) => <span className="tnum">{r.pts_back_of_pf_leader === 0 ? "—" : r.pts_back_of_pf_leader.toFixed(1)}</span> },
  ];
  return (
    <div className="flex flex-col gap-2">
      {first?.is_final && first.league_sd != null ? (
        <p className="t-caption">
          League average {first.league_avg.toFixed(1)}, standard deviation {first.league_sd.toFixed(1)}.
        </p>
      ) : null}
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => String(r.espn_team_id)}
        ariaLabel="Teams ranked by score"
        empty="No scores for this week yet."
        syncUrl={false}
        defaultSort={{ id: "rank", dir: "asc" }}
        rowProps={(r) => viewerRow(r.espn_team_id)}
      />
    </div>
  );
}
