import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { kickoffLabel } from "@/lib/format";
import type { GameContext, PlayerHeader } from "@/lib/queries/players";
import { Matchup } from "@/components/board/TeamDot";

const MARKETS = ["Rush yds", "Rec yds", "Rush + Rec", "Receptions", "Anytime TD"];
const WINDOWS = ["L5", "L10", "L20", "Season", "H2H"];
const GAME_LOG_COLS = ["Date", "Opp", "Result", "Carries", "Rush yds", "Targets", "Catches", "Rec yds", "Total", "vs line"];
const RAIL = [
  { title: "Where his yards land", body: "Sim histogram with 1-in-10 markers and the fair price." },
  { title: "How the line has moved", body: "Manual snapshots with our P(over) at each." },
  { title: "Up against", body: "Five plain-language rows on the defense he faces." },
  { title: "When he goes over, who else does", body: "Correlations from the same draws: usually up, slightly up, usually down." },
];

/**
 * Prop detail layout (design-system → Patterns → Prop detail) with a real empty state:
 * props are not in model.* until Step 6, so every data slot says so. Unknown ids render the
 * same layout with "Player not found" so the route is demoable from the sidebar.
 */
export function PropDetail({
  player,
  game,
  playerParam,
  gameParam,
}: {
  player: PlayerHeader | null;
  game: GameContext | null;
  playerParam: string;
  gameParam: string;
}) {
  const name = player?.display_name ?? "Player not found";
  const initials = player ? player.display_name.split(" ").map((s) => s[0]).slice(0, 2).join("") : "?";
  const first = player?.display_name.split(" ")[0] ?? "he";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-4" data-prop-detail>
      <div className="flex min-w-0 flex-col gap-4">
        {/* Header card */}
        <section className="card flex flex-col gap-4 p-4" aria-label="Player">
          <div className="flex items-center gap-4">
            <div
              aria-hidden
              className="flex size-12 items-center justify-center rounded-full bg-muted t-title text-muted-foreground"
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="t-title flex items-center gap-2">
                <span className="truncate">{name}</span>
                {player?.position ? (
                  <span className="rounded-sm border border-border px-1.5 py-0.5 t-colhead text-muted-foreground">
                    {player.position}
                  </span>
                ) : null}
              </h1>
              <p className="t-caption flex items-center gap-2">
                {game ? (
                  <>
                    <Matchup home={game.home} away={game.away} />
                    <span>· {kickoffLabel(game.gameday, game.gametime)} ET</span>
                    <span>· Week {game.week}</span>
                  </>
                ) : (
                  <span>Game {gameParam} not found</span>
                )}
                {!player ? <span>· id {playerParam}</span> : null}
              </p>
            </div>
            <label className="flex flex-col gap-1">
              <span className="t-colhead text-muted-foreground">Enter a line</span>
              <Input disabled placeholder="e.g. 89.5" className="h-8 w-32 rounded-md text-[13px]" aria-describedby="line-help" />
              <span id="line-help" className="t-caption">
                Props arrive with Step 6
              </span>
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs defaultValue={MARKETS[0]}>
              <TabsList aria-label="Market" className="h-8">
                {MARKETS.map((m) => (
                  <TabsTrigger key={m} value={m} disabled className="text-[12px]">
                    {m}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <ToggleGroup type="single" value="L10" aria-label="Window" className="rounded-sm border border-border p-0.5">
              {WINDOWS.map((w) => (
                <ToggleGroupItem key={w} value={w} disabled className="h-7 rounded-[4px] px-2.5 text-[12px]">
                  {w}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          {/* PropCallout slot */}
          <div className="rounded-md bg-line-tint px-4 py-3 t-sentence" data-prop-callout>
            <span className="text-foreground">
              We have no simulated line for {player ? first : "this player"} yet. The callout will read from
              `proj_players.stat_summary` and the line you enter once Step 6 lands.
            </span>
          </div>
        </section>

        {/* StatBars skeleton */}
        <section className="card p-4" aria-label="Recent games vs the line">
          <div className="mb-3 flex flex-wrap items-center gap-4">
            <span className="rounded-sm bg-line-tint px-2 py-0.5 t-body text-line">Line —</span>
            <Strip label="Over / Under" value="— / —" />
            <Strip label="Cleared it, last 10" value="—" />
            <Strip label="Average" value="—" />
            <Strip label="Typical sim game" value="—" />
            <Strip label="Chance of over" value="—" />
          </div>
          <div className="relative h-40 rounded-md border border-border-soft bg-muted">
            <div className="absolute inset-x-3 top-1/2 border-t border-dashed border-line" aria-hidden />
            <p className="absolute inset-0 flex items-center justify-center t-caption">
              One bar per recent game, green if it cleared the line · no games logged yet
            </p>
          </div>
        </section>

        {/* Game log */}
        <section className="card overflow-x-auto" aria-label="Game log">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                {GAME_LOG_COLS.map((c) => (
                  <th key={c} className="t-colhead h-9 px-3 text-left text-muted-foreground whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={GAME_LOG_COLS.length} className="h-11 px-3 text-center t-body text-muted-foreground">
                  No games logged
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      {/* Right rail */}
      <aside className="flex flex-col gap-4" aria-label="Context">
        {RAIL.map((r) => (
          <section key={r.title} className="card flex flex-col gap-1 p-4">
            <h2 className="t-body">{r.title.replace("he goes", `${first} goes`)}</h2>
            <p className="t-caption">{r.body}</p>
            <p className="mt-2 rounded-md border border-dashed border-border px-3 py-2 t-caption">Empty until Step 6</p>
          </section>
        ))}
      </aside>
    </div>
  );
}

function Strip({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex flex-col">
      <span className="t-colhead text-dim">{label}</span>
      <span className="tnum t-body">{value}</span>
    </span>
  );
}
