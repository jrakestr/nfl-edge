import { PulledBadge } from "@/components/league/PulledBadge";
import { isViewerTeam, progressLabel } from "@/lib/league";
import { leagueTeams, leagueWeekStates } from "@/lib/queries/league";

/** Title, progress, and last-pulled stamp. Each page renders it with its own season. */
export async function LeagueHeader({ season, title = "League of Champions" }: { season: number; title?: string }) {
  const [weeks, teams] = await Promise.all([leagueWeekStates(season), leagueTeams(season)]);
  const asOf = teams.map((t) => t.as_of).sort().at(-1) ?? null;
  const progress = progressLabel(weeks);
  const yours = teams.find((t) => isViewerTeam(t.espn_team_id));
  return (
    <header>
      <h1 className="t-title">{title}</h1>
      <p className="mt-1 flex flex-wrap items-baseline gap-x-4 t-caption">
        <span>{season} season</span>
        {progress ? <span>{progress}</span> : null}
        {yours ? <span className="font-semibold text-line">{yours.team} is yours</span> : null}
        <PulledBadge asOf={asOf} />
      </p>
    </header>
  );
}
