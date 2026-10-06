import { Delta } from "@/components/league/Delta";
import { PaceFigure } from "@/components/league/PaceFigure";
import { PulledBadge } from "@/components/league/PulledBadge";
import { isViewerTeam, recordLabel, type LuckRow, type StandingRow, type TeamInfo } from "@/lib/league";
import { cn } from "@/lib/utils";

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="t-colhead text-muted-foreground">{label}</span>
      <span className="t-sentence font-semibold tnum">{children}</span>
    </div>
  );
}

/** Team name, owner, record, scoring, luck, and waiver budget. The viewer's team is in --line. */
export function TeamHeader({
  team,
  standing,
  luck,
  rank,
  rosterPts,
  rosterProj,
  weeksDone,
  seasonWeeks,
}: {
  team: TeamInfo;
  standing: StandingRow | null;
  luck: LuckRow | null;
  rank: number | null;
  /** Summed season points and projection for roster rows that have both. */
  rosterPts: number | null;
  rosterProj: number | null;
  weeksDone: number;
  seasonWeeks: number;
}) {
  return (
    <header className="flex flex-col gap-3">
      <div>
        <h1 className={cn("t-title", isViewerTeam(team.espn_team_id) && "text-line")}>{team.team}</h1>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-4 t-caption">
          {isViewerTeam(team.espn_team_id) ? <span className="font-semibold text-line">Your team</span> : null}
          <span>{team.owner}</span>
          <PulledBadge asOf={team.as_of} />
        </p>
      </div>
      <div className="card grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 lg:grid-cols-8">
        <Stat label="Record">{standing ? recordLabel(standing.wins, standing.losses, standing.ties) : "—"}</Stat>
        <Stat label="Standing">{rank ?? "—"}</Stat>
        <Stat label="Points for">{standing ? standing.pf.toFixed(1) : "—"}</Stat>
        <Stat label="Points against">{standing ? standing.pa.toFixed(1) : "—"}</Stat>
        <Stat label="Actual vs projected">{standing ? <Delta value={standing.plus_minus} /> : "—"}</Stat>
        <Stat label="Luck">{luck ? <Delta value={luck.luck} kind="wins" digits={2} /> : "—"}</Stat>
        <Stat label="Roster pts / proj">
          <PaceFigure pts={rosterPts} proj={rosterProj} weeksDone={weeksDone} seasonWeeks={seasonWeeks} align="start" />
        </Stat>
        <Stat label="Waiver budget left">{`$${team.faab_remaining}`}</Stat>
      </div>
    </header>
  );
}
