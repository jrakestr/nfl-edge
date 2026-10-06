"use client";

import { EmptyState } from "@/components/EmptyState";
import { TeamLink } from "@/components/league/TeamLink";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import {
  availabilityLabel,
  espnStatusLabel,
  lineupPosition,
  paceShareGap,
  seasonShare,
  shareTone,
  slotLabel,
  viewerRow,
  type AcquireRow,
} from "@/lib/league";

/** Every rostered player and every available player, sorted by who is behind ESPN's season projection. */
export function AcquireTable({
  rows,
  season,
  seasonWeeks,
}: {
  rows: AcquireRow[];
  season: number;
  seasonWeeks: number;
}) {
  const rostered = rows.some((r) => r.source === "roster");
  if (!rostered) {
    return <EmptyState title="No roster stored">Run nfl-edge ingest espn-league to load rosters.</EmptyState>;
  }
  const wireMissingProj = rows.some((r) => r.source === "wire" && r.season_proj == null);
  const columns: DataColumn<AcquireRow>[] = [
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
      id: "team",
      header: "Team",
      sortValue: (r) => r.team,
      className: "t-body",
      cell: (r) =>
        r.espn_team_id != null ? <TeamLink id={r.espn_team_id} name={r.team} season={season} /> : r.team,
    },
    {
      id: "slot",
      header: "Slot",
      sortValue: (r) => (r.source === "wire" ? availabilityLabel(r.availability) : slotLabel(r.slot ?? "")),
      className: "t-body",
      cell: (r) => (r.source === "wire" ? availabilityLabel(r.availability) : slotLabel(r.slot ?? "")),
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
      id: "proj",
      header: "Season proj",
      align: "right",
      sortValue: (r) => r.season_proj,
      className: "t-body tnum",
      cell: (r) => (r.season_proj != null ? r.season_proj.toFixed(1) : "—"),
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
      id: "pace",
      header: "Pct",
      align: "right",
      sortValue: (r) => paceShareGap(r.season_pts, r.season_proj, r.games_played, seasonWeeks) ?? 0,
      className: "t-body tnum",
      cell: (r) => {
        const share = seasonShare(r.season_pts, r.season_proj);
        const gap = paceShareGap(r.season_pts, r.season_proj, r.games_played, seasonWeeks);
        const games = `${r.games_played} ${r.games_played === 1 ? "game" : "games"}`;
        const pct = share == null ? "—" : `${Math.round(share)}%`;
        if (gap == null) {
          return (
            <span className="inline-flex flex-col items-end">
              <span className="tnum text-foreground">{pct}</span>
              <span className="t-caption text-foreground">{games}</span>
            </span>
          );
        }
        const tone = shareTone(gap);
        const neg = tone.dir === "neg";
        const chip =
          tone.level === "high"
            ? neg
              ? "rounded-sm bg-edge-neg px-1 text-background"
              : "rounded-sm bg-edge-pos px-1 text-background"
            : tone.level === "mid"
              ? neg
                ? "rounded-sm bg-edge-neg-tint px-1 text-edge-neg"
                : "rounded-sm bg-edge-pos-tint px-1 text-edge-pos"
              : tone.level === "low"
                ? neg
                  ? "text-edge-neg"
                  : "text-edge-pos"
                : "text-foreground";
        const weight = tone.level === "low" ? "font-medium" : tone.level === "flat" ? "" : "font-semibold";
        return (
          <span className="inline-flex flex-col items-end">
            <span className={`tnum ${weight} ${chip}`} data-edge={tone.dir} data-share={tone.level}>
              {pct}
            </span>
            <span className="t-caption text-foreground">{games}</span>
          </span>
        );
      },
    },
  ];
  return (
    <section className="flex flex-col gap-2" aria-label="Acquire">
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => `${r.source}:${r.espn_team_id ?? r.espn_player_id}:${r.player}`}
        ariaLabel="Acquire"
        empty="No players match the filters."
        syncUrl
        defaultSort={{ id: "pace", dir: "asc" }}
        stickyHeader
        filters={{
          search: (r, q) => r.player.toLowerCase().includes(q),
          position: (r) => lineupPosition(r.position),
          team: (r) => r.team,
          minProj: (r) => r.season_proj,
          pool: (r) => (r.source === "wire" ? availabilityLabel(r.availability) : "Roster"),
          health: (r) => espnStatusLabel(r.status_at_pull) ?? "Healthy",
        }}
        minProjLabel="Min season proj"
        searchPlaceholder="Player"
        rowProps={(r) => viewerRow(r.espn_team_id)}
      />
      <p className="t-caption">
        Season points and season projection are ESPN&apos;s full-season numbers, including weeks he was not on a fantasy
        roster. Pct is season points over that projection. Color compares it with NFL games played over the{" "}
        {seasonWeeks || "—"}-week season, and that gap is the sort. A defense uses the team&apos;s completed games. ROS rk
        is FantasyPros rest-of-season PPR.
        {wireMissingProj ? " Available players have no season projection stored. Run nfl-edge ingest espn-league again." : ""}
      </p>
    </section>
  );
}
