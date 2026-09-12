"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Matchup } from "@/components/board/TeamDot";
import { PositionPill } from "@/components/ui/PositionPill";
import { DataTable } from "@/components/ui/DataTable";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { STAT_LABELS, STAT_ORDER, corrLabel, weeklyValue } from "@/lib/prop-stats";
import { price, signedPct } from "@/lib/edge";
import { summarizeActuals, type PlayerActualWeek } from "@/lib/player-actuals";
import type { CorrPair, FairProp, GameContext, Hist, MatchupRow, PlayerHeader, PlayerWeek, PropSnap } from "@/lib/types";
import { PropCallout } from "./PropCallout";
import { StatBars } from "./StatBars";

const WINDOWS = ["L5", "L10", "L20", "season", "H2H"] as const;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return parts.slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

function windowN(w: string): number | null {
  if (w === "L5") return 5;
  if (w === "L10") return 10;
  if (w === "L20") return 20;
  return null;
}

function HistRail({ hist, line }: { hist: Hist | null; line: number | null }) {
  const max = Math.max(1, ...(hist?.counts ?? []));
  const bins = hist?.bins ?? [];
  const counts = hist?.counts ?? [];
  let marker: number | null = null;
  if (line != null && bins.length >= 2) {
    const lo = bins[0]!;
    const hi = bins[bins.length - 1]!;
    if (hi > lo) marker = ((line - lo) / (hi - lo)) * 100;
  }
  const p10 = bins.length ? bins[Math.floor((bins.length - 1) * 0.1)] : null;
  const p90 = bins.length ? bins[Math.floor((bins.length - 1) * 0.9)] : null;
  return (
    <section className="card p-4">
      <h2 className="t-body font-semibold">Where his yards land</h2>
      <p className="mt-1 t-caption">
        1-in-10 markers at {p10 != null ? p10.toFixed(0) : "—"} and {p90 != null ? p90.toFixed(0) : "—"}.
      </p>
      <div className="relative mt-3 flex h-24 items-end gap-px">
        {counts.length === 0 ? (
          <p className="t-caption">No histogram on this run.</p>
        ) : (
          counts.map((c, i) => (
            <div
              key={i}
              className="min-w-0 flex-1 rounded-sm bg-foreground/35"
              style={{ height: `${Math.max(4, (c / max) * 100)}%` }}
            />
          ))
        )}
        {marker != null ? (
          <div
            aria-hidden
            className="absolute inset-y-0 w-px bg-line"
            style={{ left: `${Math.min(100, Math.max(0, marker))}%` }}
          />
        ) : null}
      </div>
    </section>
  );
}

export function PropDetail({
  player,
  game,
  playerId,
  fairs,
  log,
  corrs,
  matchup,
  timeline,
  histByStat,
  actualRows = [],
  currentSeason,
}: {
  player: PlayerHeader | null;
  game: GameContext | null;
  playerId: string;
  fairs: FairProp[];
  log: PlayerWeek[];
  corrs: CorrPair[];
  matchup: MatchupRow[];
  timeline: PropSnap[];
  histByStat: Record<string, Hist | null>;
  actualRows?: PlayerActualWeek[];
  currentSeason: number;
}) {
  const found = player != null;
  const name = found ? player.display_name : "Player not found";
  const stats = STAT_ORDER.filter((s) => fairs.some((f) => f.stat === s));
  const [stat, setStat] = useState<string>(stats[0] ?? "rush_yds");
  const [win, setWin] = useState<(typeof WINDOWS)[number]>("L10");
  const fair = fairs.find((f) => f.stat === stat) ?? fairs[0] ?? null;
  const line = fair?.market_line ?? fair?.fair_line ?? null;
  const sentence = fair?.market_sentence ?? fair?.sentence;
  const lean = fair?.market_line != null ? fair.lean : null;
  const pOver = fair?.market_p_over ?? fair?.p_over ?? null;
  const n = windowN(win);
  const realized = summarizeActuals(actualRows, currentSeason, player?.position, playerId);
  const shownLog = useMemo(() => {
    if (win === "H2H" && game) {
      const opp = player?.latest_team === game.home ? game.away : game.home;
      return log.filter((g) => g.opponent === opp);
    }
    if (win === "season") return log.filter((g) => g.season === log[0]?.season);
    return n != null ? log.slice(0, n) : log;
  }, [log, win, n, game, player]);

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
                {player?.position ? <PositionPill position={player.position} /> : null}
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
              {realized.kind === "ok" ? (
                <div className="mt-2" aria-label="Realized DK points">
                  <p className="t-body tnum font-semibold text-foreground">
                    {realized.season} DK · {realized.ppg.toFixed(1)} /g · {realized.gp} gp
                  </p>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {realized.games.map((g) => (
                      <li key={`${g.season}-${g.week}`} className="flex justify-between gap-3 t-caption">
                        <span>
                          {g.gameday ?? `wk${g.week}`}
                          {g.opponent ? ` · ${g.opponent}` : ""}
                        </span>
                        <span className="tnum font-semibold text-foreground">{g.fpts_dk.toFixed(1)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : realized.kind === "none" ? (
                <p className="mt-2 t-caption" role="status">
                  No prior-season data
                </p>
              ) : null}
            </div>
          </div>
          <label className="flex max-w-xs flex-col gap-1">
            <span className="t-colhead text-muted-foreground">Entered line</span>
            <Input
              readOnly
              value={fair?.market_line != null ? String(fair.market_line) : ""}
              placeholder="No line entered"
              aria-describedby="prop-line-help"
            />
            <span id="prop-line-help" className="t-caption">
              Enter a line on the Props board. Until then we use our fair line.
            </span>
          </label>
          <Tabs value={stat} onValueChange={setStat}>
            <TabsList variant="line" className="h-8">
              {(stats.length ? stats : ["rush_yds"]).map((id) => (
                <TabsTrigger key={id} value={id} className="t-body px-2">
                  {STAT_LABELS[id] ?? id}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <ToggleGroup
            type="single"
            value={win}
            onValueChange={(v) => v && setWin(v as (typeof WINDOWS)[number])}
            size="sm"
            spacing={0}
            className="w-fit"
          >
            {WINDOWS.map((w) => (
              <ToggleGroupItem key={w} value={w} className="t-caption h-7 px-2">
                {w}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <PropCallout sentence={sentence} lean={lean} />
        </header>
        <StatBars
          log={shownLog}
          stat={fair?.stat ?? stat}
          line={line}
          overOdds={fair?.over_odds}
          underOdds={fair?.under_odds}
          typical={fair?.mean}
          pOver={pOver}
        />
        <DataTable
          data={shownLog}
          getRowId={(g) => `${g.season}-${g.week}`}
          empty="No games logged"
          ariaLabel="Game log"
          syncUrl={false}
          columns={[
            {
              id: "date",
              header: "Date",
              sortValue: (g) => g.gameday ?? `${g.season}-${g.week}`,
              cell: (g) => <span className="t-caption tnum">{g.gameday ?? `${g.season} wk${g.week}`}</span>,
            },
            {
              id: "opp",
              header: "Opp",
              sortValue: (g) => g.opponent ?? "",
              cell: (g) => <span className="font-semibold text-foreground">{g.opponent ?? "—"}</span>,
            },
            {
              id: "result",
              header: "Result",
              sortValue: (g) => (g.home_score ?? 0) + (g.away_score ?? 0),
              cell: (g) => (
                <span className="tnum font-semibold text-foreground">
                  {g.home_score != null && g.away_score != null ? `${g.away_score}–${g.home_score}` : "—"}
                </span>
              ),
            },
            {
              id: "carries",
              header: "Carries",
              align: "right",
              sortValue: (g) => (typeof g.stats.carries === "number" ? g.stats.carries : null),
              cell: (g) => (
                <span className="tnum font-semibold text-foreground">
                  {typeof g.stats.carries === "number" ? g.stats.carries : "—"}
                </span>
              ),
            },
            {
              id: "rush",
              header: "Rush yds",
              align: "right",
              sortValue: (g) => weeklyValue(g.stats, "rush_yds"),
              cell: (g) => (
                <span className="tnum font-semibold text-foreground">{weeklyValue(g.stats, "rush_yds") ?? "—"}</span>
              ),
            },
            {
              id: "targets",
              header: "Targets",
              align: "right",
              sortValue: (g) => (typeof g.stats.targets === "number" ? g.stats.targets : null),
              cell: (g) => (
                <span className="tnum font-semibold text-foreground">
                  {typeof g.stats.targets === "number" ? g.stats.targets : "—"}
                </span>
              ),
            },
            {
              id: "catches",
              header: "Catches",
              align: "right",
              sortValue: (g) => weeklyValue(g.stats, "rec"),
              cell: (g) => (
                <span className="tnum font-semibold text-foreground">{weeklyValue(g.stats, "rec") ?? "—"}</span>
              ),
            },
            {
              id: "recYds",
              header: "Rec yds",
              align: "right",
              sortValue: (g) => weeklyValue(g.stats, "rec_yds"),
              cell: (g) => (
                <span className="tnum font-semibold text-foreground">{weeklyValue(g.stats, "rec_yds") ?? "—"}</span>
              ),
            },
            {
              id: "total",
              header: "Total",
              align: "right",
              sortValue: (g) => {
                const rush = weeklyValue(g.stats, "rush_yds");
                const recY = weeklyValue(g.stats, "rec_yds");
                return rush != null || recY != null ? (rush ?? 0) + (recY ?? 0) : null;
              },
              cell: (g) => {
                const rush = weeklyValue(g.stats, "rush_yds");
                const recY = weeklyValue(g.stats, "rec_yds");
                return (
                  <span className="tnum font-semibold text-foreground">
                    {rush != null || recY != null ? (rush ?? 0) + (recY ?? 0) : "—"}
                  </span>
                );
              },
            },
            {
              id: "vs",
              header: "Vs line",
              sortValue: (g) => (fair ? weeklyValue(g.stats, fair.stat) : null),
              cell: (g) => {
                const vs = fair ? weeklyValue(g.stats, fair.stat) : null;
                return (
                  <span className="tnum font-semibold text-foreground">
                    {vs == null || line == null ? "—" : vs > line ? "Over" : vs < line ? "Under" : "Push"}
                  </span>
                );
              },
            },
          ]}
        />
      </div>
      <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[340px]">
        <HistRail hist={histByStat[fair?.stat ?? stat] ?? null} line={line} />
        <section className="card p-4">
          <h2 className="t-body font-semibold">How the line has moved</h2>
          {timeline.length === 0 ? (
            <p className="mt-1 t-caption">No snapshots entered.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 t-caption">
              {timeline.map((s) => (
                <li key={s.captured_at} className="flex justify-between gap-2">
                  <span>{s.captured_at.slice(0, 16)}</span>
                  <span className="tnum">
                    {s.line} · {price(s.over_odds)} / {price(s.under_odds)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-4">
          <h2 className="t-body font-semibold">Up against</h2>
          {matchup.length === 0 ? (
            <p className="mt-1 t-caption">No team_game_agg rows for this opponent yet.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 t-caption">
              {matchup.map((m) => (
                <li key={m.label} className="flex justify-between gap-2">
                  <span>{m.label}</span>
                  <span className="tnum">{m.value}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card p-4">
          <h2 className="t-body font-semibold">When X goes over, who else does</h2>
          {corrs.length === 0 ? (
            <p className="mt-1 t-caption">No correlations on this run.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 t-caption">
              {corrs.map((c) => (
                <li key={c.a} className="flex justify-between gap-2">
                  <span>{c.a}</span>
                  <span>
                    {corrLabel(c.corr)} · {signedPct(c.corr)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>
    </div>
  );
}
