"use client";

import { groupStripGames, type StripGame } from "@/lib/kickoff";
import { selectedOnSlate, toggleGame, toggleWindow } from "@/lib/games-param";
import { kickoffLabel } from "@/lib/format";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useGamesSelection } from "./GamesSelection";

function chipCaption(g: StripGame): string {
  if (g.is_final && g.away_score != null && g.home_score != null) {
    return `${g.away_score}–${g.home_score} Final`;
  }
  return kickoffLabel(g.gameday, g.gametime);
}

export function GameStrip({ games }: { games: StripGame[] }) {
  const { selected, setSelected } = useGamesSelection();
  const groups = groupStripGames(games);
  const visibleIds = games.map((g) => g.game_id);
  const onSlate = selectedOnSlate(selected, visibleIds);
  const onSlateSet = new Set(onSlate);

  if (!games.length) return null;

  return (
    <div className="flex items-start gap-3" data-game-strip="">
      <div className="min-w-0 flex-1 overflow-x-auto">
        <div className="flex items-start gap-5">
          {groups.map((group) => {
            const ids = group.games.map((g) => g.game_id);
            const allOn = ids.length > 0 && ids.every((id) => onSlateSet.has(id));
            return (
              <div key={group.key} className="flex shrink-0 flex-col gap-1.5">
                <button
                  type="button"
                  className="t-colhead w-fit text-left text-muted-foreground hover:text-foreground"
                  aria-pressed={allOn}
                  onClick={() => setSelected(toggleWindow(selected, ids))}
                >
                  {group.label} {group.games.length}
                </button>
                <div className="flex items-center gap-1.5">
                  {group.games.map((g) => {
                    const pressed = onSlateSet.has(g.game_id);
                    return (
                      <button
                        key={g.game_id}
                        type="button"
                        aria-pressed={pressed}
                        aria-label={`${g.away} at ${g.home}`}
                        onClick={() => setSelected(toggleGame(selected, g.game_id))}
                        className={cn(
                          "inline-flex h-8 items-center gap-1 rounded-md border px-2 t-caption font-semibold",
                          pressed
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-card text-foreground",
                        )}
                      >
                        <TeamLogo team={g.away} size={18} showAbbr={false} />
                        <span className={pressed ? "text-background" : "text-muted-foreground"}>@</span>
                        <TeamLogo team={g.home} size={18} showAbbr={false} />
                        <span className="tnum whitespace-nowrap">{chipCaption(g)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {selected.length > 0 ? (
        <Button type="button" variant="outline" size="sm" onClick={() => setSelected([])}>
          Clear games
        </Button>
      ) : null}
    </div>
  );
}
