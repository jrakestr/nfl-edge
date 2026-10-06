"use client";

import { Delta } from "@/components/league/Delta";
import { TeamLink } from "@/components/league/TeamLink";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { MIN_FINAL_WEEKS_FOR_LUCK, viewerRow, type LuckFit, type LuckRow } from "@/lib/league";

/**
 * Projected, earned, and actual wins with luck = actual − earned. Luck needs at least two final weeks;
 * under that the page says so instead of fitting on a handful of games.
 */
export function LuckTable({
  rows,
  fit,
  finalWeeks,
  season,
}: {
  rows: LuckRow[];
  fit: LuckFit | null;
  finalWeeks: number;
  season: number;
}) {
  if (finalWeeks < MIN_FINAL_WEEKS_FOR_LUCK || rows.length === 0 || !fit) {
    return (
      <EmptyState title="Luck needs at least 2 final weeks">
        {finalWeeks} so far. It appears after the second week finishes and nfl-edge ingest espn-league runs.
      </EmptyState>
    );
  }
  const columns: DataColumn<LuckRow>[] = [
    {
      id: "team",
      header: "Team",
      sortValue: (r) => r.team,
      cell: (r) => <TeamLink id={r.espn_team_id} name={r.team} season={season} />,
    },
    { id: "proj", header: "Projected wins", align: "right", sortValue: (r) => r.proj_wins, cell: (r) => <span className="tnum">{r.proj_wins.toFixed(2)}</span> },
    { id: "earned", header: "Earned wins", align: "right", sortValue: (r) => r.earned_wins, cell: (r) => <span className="tnum">{r.earned_wins.toFixed(2)}</span> },
    { id: "actual", header: "Actual wins", align: "right", sortValue: (r) => r.actual_wins, cell: (r) => <span className="tnum font-semibold">{r.actual_wins}</span> },
    { id: "luck", header: "Luck", align: "right", sortValue: (r) => r.luck, cell: (r) => <Delta value={r.luck} kind="wins" digits={2} /> },
    { id: "allplay", header: "All-play luck", align: "right", sortValue: (r) => r.luck_allplay, cell: (r) => <Delta value={r.luck_allplay} kind="wins" digits={2} /> },
  ];
  return (
    <div className="flex flex-col gap-3">
      <p className="t-sentence">
        Earned wins are what each team&apos;s score would have won against its opponent&apos;s projection.
        Luck is actual wins minus earned wins. All-play luck is actual wins minus the share of the league
        each team outscored.
      </p>
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => String(r.espn_team_id)}
        ariaLabel="Season luck"
        empty="No luck rows for this season."
        syncUrl={false}
        defaultSort={{ id: "luck", dir: "desc" }}
        rowProps={(r) => viewerRow(r.espn_team_id)}
      />
      <p className="t-caption">
        Fitted on {fit.n_team_weeks} team-weeks over {fit.weeks} weeks: ESPN projections run {fit.bias.toFixed(1)} points
        high, and a team&apos;s score typically misses its projection by {fit.sd.toFixed(1)} points. With this few
        games the sample is small, so read luck as a direction, not a verdict.
      </p>
    </div>
  );
}
