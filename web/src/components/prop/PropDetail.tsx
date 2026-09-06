import { Input } from "@/components/ui/input";
import { Matchup } from "@/components/board/TeamDot";
import type { GameContext, PlayerHeader } from "@/lib/queries/players";
import { PropCallout } from "./PropCallout";
import { PropMarkets } from "./PropMarkets";
import { StatBars } from "./StatBars";

const LOG_COLS = ["Date", "Opp", "Result", "Carries", "Rush yds", "Targets", "Catches", "Rec yds", "Total", "Vs line"];
const RAIL = [
  { title: "Where his yards land", body: "Sim histogram arrives with the draws-backed rail (Step 6)." },
  { title: "How the line has moved", body: "Manual snapshots with model P(over) at each. None entered yet." },
  { title: "Up against", body: "Defense/offense matchup rows from team_game_agg. Not wired yet." },
  { title: "When X goes over, who else does", body: "Correlations as usually up / slightly up / usually down." },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

export function PropDetail({
  player,
  game,
  playerId,
}: {
  player: PlayerHeader | null;
  game: GameContext | null;
  playerId: string;
}) {
  const found = player != null;
  const name = found ? player.display_name : "Player not found";
  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <header className="card flex flex-col gap-3 p-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted t-body font-bold"
            >
              {initials(found ? player.display_name : playerId)}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="t-title">{name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 t-caption">
                {player?.position ? (
                  <span className="rounded-md bg-accent px-1.5 py-0.5 t-caption text-foreground">
                    {player.position}
                  </span>
                ) : null}
                {game ? (
                  <span className="inline-flex items-center gap-1.5">
                    <Matchup home={game.home} away={game.away} />
                    <span>
                      {game.gameday}
                      {game.gametime ? ` ${game.gametime}` : ""}
                    </span>
                  </span>
                ) : (
                  <span>Unknown game</span>
                )}
              </div>
            </div>
          </div>
          <label className="flex max-w-xs flex-col gap-1">
            <span className="t-colhead text-dim">Enter a line</span>
            <Input disabled placeholder="e.g. 89.5" aria-describedby="prop-line-help" />
            <span id="prop-line-help" className="t-caption">
              Props arrive with Step 6
            </span>
          </label>
          <PropMarkets />
          <PropCallout />
        </header>
        <StatBars />
        <section className="card overflow-hidden p-0">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                {LOG_COLS.map((c) => (
                  <th key={c} className="px-3 py-2 text-left t-colhead text-dim">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={LOG_COLS.length} className="px-3 py-6 text-center t-caption">
                  No games logged
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>
      <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[340px]">
        {RAIL.map((card) => (
          <section key={card.title} className="card p-4">
            <h2 className="t-body font-semibold">{card.title}</h2>
            <p className="mt-1 t-caption">{card.body}</p>
          </section>
        ))}
      </aside>
    </div>
  );
}
