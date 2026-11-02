"use client";

import { Button } from "@/components/ui/button";
import {
  GAME_SCRIPT_LABEL,
  SHOWDOWN_SCRIPT_LABEL,
  describeActiveScripts,
  slateGamesFromPool,
  suggestGameStance,
} from "@/lib/optimize/game-script";
import type {
  GameScriptKind,
  GameStance,
  OptPlayer,
  ShowdownScriptKind,
  SolveControls,
} from "@/lib/optimize/types";

function fmtSpread(home: string, away: string, spread: number | null): string {
  if (spread == null) return "—";
  if (spread === 0) return "PK";
  return spread > 0 ? `${home} −${spread.toFixed(1)}` : `${away} −${Math.abs(spread).toFixed(1)}`;
}

export function GameScriptBuilder({
  players,
  controls,
  showdown,
  onChange,
}: {
  players: OptPlayer[];
  controls: SolveControls;
  showdown: boolean;
  onChange: (patch: Partial<SolveControls>) => void;
}) {
  const games = slateGamesFromPool(players);
  if (games.length === 0) return null;

  const activeDescriptions = describeActiveScripts(controls, showdown);

  if (showdown) {
    const g = games[0]!;
    const current = controls.showdownScript ?? null;
    const options: { id: ShowdownScriptKind; label: string }[] = [
      { id: "shootout", label: SHOWDOWN_SCRIPT_LABEL.shootout },
      { id: "away_control", label: `${g.away} control (4–2 / 5–1)` },
      { id: "home_control", label: `${g.home} control (4–2 / 5–1)` },
      { id: "defensive", label: SHOWDOWN_SCRIPT_LABEL.defensive },
    ];
    return (
      <div className="mt-3 flex flex-col gap-2 border-t pt-3" aria-label="Game script builder">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="t-colhead text-muted-foreground">Game script stance</p>
            <p className="t-caption text-muted-foreground">
              Construct hand-made Showdown rosters around how {g.away} @ {g.home} plays out instead of raw points.
            </p>
          </div>
          {current ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onChange({ showdownScript: null })}
            >
              Clear script
            </Button>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Showdown script">
          {options.map((opt) => (
            <Button
              key={opt.id}
              type="button"
              size="sm"
              variant={current === opt.id ? "secondary" : "outline"}
              onClick={() =>
                onChange({ showdownScript: current === opt.id ? null : opt.id })
              }
            >
              {opt.label}
            </Button>
          ))}
        </div>
        {activeDescriptions.map((line) => (
          <p key={line} className="t-caption text-foreground">
            {line}
          </p>
        ))}
      </div>
    );
  }

  const stances = controls.gameScripts ?? [];
  const byGame = new Map(stances.map((s) => [s.gameId, s]));

  function setStance(gameId: string, next: GameStance | null) {
    const rest = stances.filter((s) => s.gameId !== gameId);
    if (!next) {
      onChange({ gameScripts: rest.length ? rest : undefined });
      return;
    }
    // Only 1 shootout game allowed in Classic (1 QB slot)
    const cleaned =
      next.script === "shootout"
        ? rest.filter((s) => s.script !== "shootout")
        : rest;
    onChange({
      gameScripts: [...cleaned, next],
      ...(next.script === "shootout"
        ? {
            stackN: Math.max(controls.stackN, 2),
            bringBack: Math.max(controls.bringBack, 1),
          }
        : {}),
    });
  }

  function applySuggested() {
    const next: GameStance[] = [];
    let hasShootout = false;
    const sorted = [...games].sort((a, b) => (b.marketTotal ?? 0) - (a.marketTotal ?? 0));
    for (const g of sorted) {
      const s = suggestGameStance(g);
      if (!s) continue;
      if (s.script === "shootout") {
        if (hasShootout) continue;
        hasShootout = true;
      }
      next.push(s);
    }
    onChange({
      gameScripts: next.length ? next : undefined,
      ...(hasShootout
        ? {
            stackN: Math.max(controls.stackN, 2),
            bringBack: Math.max(controls.bringBack, 1),
          }
        : {}),
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t pt-3" aria-label="Game script builder">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="t-colhead text-muted-foreground">Game script builder</p>
          <p className="t-caption text-muted-foreground">
            Take a stance on how games play out: pick your primary shootout stack, RB+DST control scripts, or low-total grinds.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" onClick={applySuggested}>
            Suggest from lines
          </Button>
          {stances.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onChange({ gameScripts: undefined })}
            >
              Clear scripts ({stances.length})
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
        {games.map((g) => {
          const st = byGame.get(g.gameId) ?? null;
          return (
            <div
              key={g.gameId}
              className="flex flex-col justify-between gap-2 rounded-md border border-border-soft p-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="t-body font-semibold text-foreground">
                  {g.away} @ {g.home}
                </span>
                <span className="t-caption tnum text-[color:var(--line)]">
                  {g.marketTotal != null ? `O/U ${g.marketTotal.toFixed(1)}` : "—"}
                  {" · "}
                  {fmtSpread(g.home, g.away, g.marketSpread)}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {(["shootout", "control", "grind", "fade"] as GameScriptKind[]).map((kind) => {
                  const active = st?.script === kind;
                  const defaultTeam =
                    kind === "shootout" || kind === "control"
                      ? (g.marketSpread ?? 0) >= 0
                        ? g.home
                        : g.away
                      : null;
                  return (
                    <Button
                      key={kind}
                      type="button"
                      size="sm"
                      variant={active ? "secondary" : "outline"}
                      onClick={() =>
                        setStance(
                          g.gameId,
                          active ? null : { gameId: g.gameId, script: kind, team: defaultTeam },
                        )
                      }
                    >
                      {GAME_SCRIPT_LABEL[kind]}
                    </Button>
                  );
                })}
              </div>

              {st && (st.script === "shootout" || st.script === "control") ? (
                <div className="flex items-center gap-1.5 pt-0.5">
                  <span className="t-caption text-muted-foreground">
                    {st.script === "shootout" ? "Lead QB:" : "Controlling team:"}
                  </span>
                  {[g.away, g.home].map((tm) => (
                    <Button
                      key={tm}
                      type="button"
                      size="sm"
                      variant={st.team === tm ? "secondary" : "outline"}
                      onClick={() =>
                        setStance(g.gameId, {
                          ...st,
                          team: st.team === tm && st.script === "shootout" ? null : tm,
                        })
                      }
                    >
                      {tm}
                    </Button>
                  ))}
                  {st.script === "shootout" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={!st.team ? "secondary" : "outline"}
                      onClick={() => setStance(g.gameId, { ...st, team: null })}
                    >
                      Either QB
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {activeDescriptions.length > 0 ? (
        <ul className="flex flex-col gap-0.5 pt-1">
          {activeDescriptions.map((line) => (
            <li key={line} className="t-caption text-foreground">
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
