import { Delta } from "@/components/league/Delta";
import { TeamLink } from "@/components/league/TeamLink";
import { signed } from "@/lib/edge";
import { isViewerTeam, type LeagueTeamWeek } from "@/lib/league";
import { cn } from "@/lib/utils";

function Side({ r, season, final }: { r: LeagueTeamWeek; season: number; final: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-4">
      <TeamLink id={r.espn_team_id} name={r.team} season={season} className="t-body truncate" />
      <span className="t-body tnum font-semibold">{final ? r.actual_pts.toFixed(1) : "—"}</span>
      <span className="t-body tnum text-muted-foreground" title="Projected">
        {r.proj_pts.toFixed(1)}
      </span>
      <span className="t-body tnum min-w-14 text-right">{final ? <Delta value={r.own_pm} /> : "—"}</span>
    </div>
  );
}

/**
 * One matchup: score, projection, actual minus projected for each side. Swing is how far the
 * result moved from the projected margin, and toward whom. An open matchup shows no result.
 */
export function MatchupCard({ a, b, season }: { a: LeagueTeamWeek; b: LeagueTeamWeek; season: number }) {
  const final = a.is_final && b.is_final;
  const toward = a.swing >= 0 ? a : b;
  const yours = isViewerTeam(a.espn_team_id) || isViewerTeam(b.espn_team_id);
  return (
    <article className={cn("card flex flex-col gap-2 p-4", yours && "border-l-2 border-l-line bg-line-tint")} data-yours={yours ? "true" : undefined}>
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 t-colhead text-muted-foreground">
        <span>Team</span>
        <span>Score</span>
        <span>Proj</span>
        <span className="min-w-14 text-right">Vs proj</span>
      </div>
      <Side r={a} season={season} final={final} />
      <Side r={b} season={season} final={final} />
      <p className="t-caption">
        {final
          ? Math.abs(a.swing) < 0.05
            ? "Result matched the projected margin."
            : `Swing ${signed(Math.abs(a.swing), 1).replace("+", "")} toward ${toward.team}: projected margin ${signed(toward.proj_margin, 1)}, actual ${signed(toward.actual_margin, 1)}.`
          : "In progress. Swing appears when both teams are final."}
      </p>
    </article>
  );
}
