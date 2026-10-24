"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Matchup } from "@/components/board/TeamDot";
import { PlayerAnalysis } from "@/components/players/PlayerAnalysis";
import { PositionPill } from "@/components/ui/PositionPill";
import { DataTable } from "@/components/ui/DataTable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { STAT_LABELS, STAT_ORDER, corrLabel, weeklyValue } from "@/lib/prop-stats";
import { price, signedPct } from "@/lib/edge";
import type { FpWeek, SimWeek } from "@/lib/player-history";
import { summarizeActuals, type PlayerActualWeek } from "@/lib/player-actuals";
import type { CorrPair, FairProp, GameContext, Hist, MatchupRow, PlayerHeader, PlayerNewsItem, PlayerWeek, PropSnap } from "@/lib/types";
import type { PeerOption } from "@/lib/queries/players";
import { ordinal, rankTier, type DefenseVsPosition, type PlayerUsage } from "@/lib/usage";
import { cn } from "@/lib/utils";
import { PlayerHomeCards } from "./PlayerHomeCards";
import { PlayerIntelCard } from "./PlayerIntelCard";
import { PlayerNewsCard } from "./PlayerNewsCard";
import { PropCallout } from "./PropCallout";
import { StatBars } from "./StatBars";
import { UsagePanel } from "./UsagePanel";
import { VisualHistogram } from "./VisualHistogram";

const WINDOWS = ["L5", "L10", "L20", "season", "H2H"] as const;
type DetailTab = "all" | "home" | "trends" | "gamelogs" | "correlations";

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

type HeroTile = {
  label: string;
  value: string;
  sub: string;
  rankBadge?: { text: string; tier: "good" | "mid" | "bad" } | null;
};

function computeHeroTiles(
  position: string | null | undefined,
  seasonLog: PlayerWeek[],
  usage: PlayerUsage | null,
  realized: ReturnType<typeof summarizeActuals>,
): HeroTile[] {
  const gp = Math.max(1, seasonLog.length);
  const sumStat = (key: string) =>
    seasonLog.reduce((acc, g) => acc + (weeklyValue(g.stats, key) ?? 0), 0);
  const rankMap = new Map(usage?.ranks.map((r) => [r.metric, r]) ?? []);
  const pos = (position ?? "").toUpperCase();

  const badgeFor = (metric: "dk_pg" | "target_share" | "snap_pct" | "fp_per_opportunity") => {
    const r = rankMap.get(metric);
    if (!r) return null;
    return {
      text: `${pos || "RK"}${r.rank}`,
      tier: rankTier(r.rank, r.of),
    };
  };

  const dkTile: HeroTile =
    realized.kind === "ok"
      ? {
          label: "DK FPTS / G",
          value: `${realized.ppg.toFixed(1)}/g`,
          sub: `${realized.season} · ${realized.gp} gp`,
          rankBadge: badgeFor("dk_pg"),
        }
      : {
          label: "DK FPTS / G",
          value: usage?.season?.dk_pg != null ? `${usage.season.dk_pg.toFixed(1)}/g` : "—",
          sub: usage?.season?.games ? `${usage.season.games} gp` : "No games",
          rankBadge: badgeFor("dk_pg"),
        };

  if (pos === "QB") {
    const passYds = sumStat("pass_yds");
    const passTd = sumStat("pass_td");
    const rushYds = sumStat("rush_yds");
    return [
      {
        label: "PASS YDS / G",
        value: seasonLog.length ? `${(passYds / gp).toFixed(1)}/g` : "—",
        sub: seasonLog.length ? `${passYds.toLocaleString()} tot` : "—",
      },
      {
        label: "PASS TD / G",
        value: seasonLog.length ? `${(passTd / gp).toFixed(1)}/g` : "—",
        sub: seasonLog.length ? `${passTd} tot` : "—",
      },
      {
        label: "RUSH YDS / G",
        value: seasonLog.length ? `${(rushYds / gp).toFixed(1)}/g` : "—",
        sub: seasonLog.length ? `${rushYds.toLocaleString()} tot` : "—",
      },
      dkTile,
    ];
  }

  if (pos === "RB") {
    const rushYds = sumStat("rush_yds");
    const recYds = sumStat("rec_yds");
    const rushTd = sumStat("rush_td");
    const recTd = sumStat("rec_td");
    return [
      {
        label: "RUSH YDS / G",
        value: seasonLog.length ? `${(rushYds / gp).toFixed(1)}/g` : "—",
        sub: seasonLog.length ? `${rushYds.toLocaleString()} tot` : "—",
      },
      {
        label: "REC YDS / G",
        value: seasonLog.length ? `${(recYds / gp).toFixed(1)}/g` : "—",
        sub: seasonLog.length ? `${recYds.toLocaleString()} tot` : "—",
        rankBadge: badgeFor("target_share"),
      },
      {
        label: "TOTAL TD / G",
        value: seasonLog.length ? `${((rushTd + recTd) / gp).toFixed(2)}/g` : "—",
        sub: seasonLog.length ? `${rushTd + recTd} tot` : "—",
      },
      dkTile,
    ];
  }

  if (pos === "WR" || pos === "TE") {
    const rec = sumStat("rec");
    const recYds = sumStat("rec_yds");
    const recTd = sumStat("rec_td");
    return [
      {
        label: "REC YDS / G",
        value: seasonLog.length ? `${(recYds / gp).toFixed(1)}/g` : "—",
        sub: seasonLog.length ? `${recYds.toLocaleString()} tot` : "—",
      },
      {
        label: "REC / G",
        value: seasonLog.length ? `${(rec / gp).toFixed(1)}/g` : "—",
        sub: seasonLog.length ? `${rec} tot` : "—",
        rankBadge: badgeFor("target_share"),
      },
      {
        label: "REC TD / G",
        value: seasonLog.length ? `${(recTd / gp).toFixed(2)}/g` : "—",
        sub: seasonLog.length ? `${recTd} tot` : "—",
      },
      dkTile,
    ];
  }

  return [dkTile];
}

function PlayerWeekSelect({
  season,
  week,
  games,
  playerId,
  gameId,
  basePath = "/players",
}: {
  season: number;
  week: number;
  games: { week: number; game_id: string }[];
  playerId: string;
  gameId: string | null;
  basePath?: "/players" | "/props";
}) {
  const router = useRouter();
  const options = [...games];
  if (gameId && !options.some((g) => g.week === week)) {
    options.push({ week, game_id: gameId });
    options.sort((a, b) => a.week - b.week);
  }
  if (options.length === 0) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="t-caption">Week {week}</span>
        <span className="t-caption">{season}</span>
      </span>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Select
        value={String(week)}
        onValueChange={(v) => {
          const next = Number(v);
          const target = options.find((g) => g.week === next);
          if (!target || next === week) return;
          router.push(`${basePath}/${target.game_id}/${playerId}`);
        }}
      >
        <SelectTrigger aria-label="Week" className="h-8 w-[120px] rounded-md t-body">
          <SelectValue>{`Week ${week}`}</SelectValue>
        </SelectTrigger>
        <SelectContent align="end">
          {options.map((g) => (
            <SelectItem key={g.week} value={String(g.week)}>
              Week {g.week}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="t-caption">{season}</span>
    </div>
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
  drawsPruned = false,
  asOf = null,
  seasonLog = [],
  projections = [],
  simProjections = [],
  games = [],
  usage = null,
  defense = null,
  fptsHist = null,
  opponent = null,
  news = [],
  peers = [],
  basePath = "/players",
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
  drawsPruned?: boolean;
  asOf?: { season: number; week: number } | null;
  seasonLog?: PlayerWeek[];
  projections?: FpWeek[];
  simProjections?: SimWeek[];
  games?: { week: number; game_id: string }[];
  usage?: PlayerUsage | null;
  defense?: DefenseVsPosition | null;
  fptsHist?: Hist | null;
  opponent?: string | null;
  news?: PlayerNewsItem[];
  peers?: PeerOption[];
  basePath?: "/players" | "/props";
}) {
  const found = player != null;
  const name = found ? player.display_name : "Player not found";
  const stats = STAT_ORDER.filter((s) => fairs.some((f) => f.stat === s));
  const [stat, setStat] = useState<string>(stats[0] ?? "rush_yds");
  const [win, setWin] = useState<(typeof WINDOWS)[number]>("L10");
  const [detailTab, setDetailTab] = useState<DetailTab>("all");
  const fair = fairs.find((f) => f.stat === stat) ?? fairs[0] ?? null;
  const line = fair?.market_line ?? fair?.fair_line ?? null;
  const sentence = fair?.market_sentence ?? fair?.sentence;
  const lean = fair?.market_line != null ? fair.lean : null;
  const pOver = fair?.market_p_over ?? fair?.p_over ?? null;
  const n = windowN(win);
  const realized = summarizeActuals(actualRows, currentSeason, player?.position, playerId);
  const heroTiles = useMemo(
    () => computeHeroTiles(player?.position, seasonLog.length ? seasonLog : log, usage, realized),
    [player?.position, seasonLog, log, usage, realized],
  );

  const shownLog = useMemo(() => {
    if (win === "H2H" && game) {
      const opp = player?.latest_team === game.home ? game.away : game.home;
      return log.filter((g) => g.opponent === opp);
    }
    if (win === "season") return log.filter((g) => g.season === log[0]?.season);
    return n != null ? log.slice(0, n) : log;
  }, [log, win, n, game, player]);

  const showProps = fairs.length > 0;
  const activeHist = histByStat[fair?.stat ?? stat] ?? fair?.hist ?? fptsHist ?? null;

  return (
    <div className="flex flex-col gap-4">
      {/* StatRankings 3-Panel Hero Card (Identity | 4-Stat Summary | Upcoming Matchup Outlook) */}
      <header className="card p-4" data-slot="player-hero">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-center">
          {/* Panel 1: Identity & Status */}
          <div className="flex items-start gap-3 lg:col-span-4">
            <span
              aria-hidden
              className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-surface-inset border border-border-soft t-body font-bold text-foreground"
            >
              {initials(found ? player.display_name : playerId)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="t-title truncate">{name}</h1>
                {found ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-edge-pos-tint px-2 py-0.5 t-caption font-semibold text-edge-pos">
                    <span className="size-1.5 rounded-full bg-edge-pos" aria-hidden />
                    ACTIVE
                  </span>
                ) : null}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 t-caption">
                {player?.position ? <PositionPill position={player.position} /> : null}
                {player?.latest_team ? <TeamLogo team={player.latest_team} /> : null}
                {asOf ? (
                  <PlayerWeekSelect
                    season={asOf.season}
                    week={asOf.week}
                    games={games}
                    playerId={playerId}
                    gameId={game?.game_id ?? null}
                    basePath={basePath}
                  />
                ) : null}
              </div>
              {realized.kind === "ok" ? (
                <div className="mt-2" aria-label="Realized DK points">
                  <p className="t-body tnum font-semibold text-foreground">
                    {realized.season} DK · {realized.ppg.toFixed(1)} /g · {realized.gp} gp
                  </p>
                </div>
              ) : realized.kind === "none" ? (
                <p className="mt-2 t-caption" role="status">
                  No prior-season data
                </p>
              ) : null}
            </div>
          </div>

          {/* Panel 2: 4 Headline Stat Tiles with Rank Badges */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:col-span-5">
            {heroTiles.map((tile) => (
              <div
                key={tile.label}
                className="flex flex-col justify-between rounded-lg border border-border-soft bg-surface-inset p-2.5"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="t-colhead text-muted-foreground">{tile.label}</span>
                  {tile.rankBadge ? (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 t-caption tnum font-semibold",
                        tile.rankBadge.tier === "good" && "bg-edge-pos-tint text-edge-pos",
                        tile.rankBadge.tier === "bad" && "bg-edge-neg-tint text-edge-neg",
                        tile.rankBadge.tier === "mid" && "bg-card text-muted-foreground",
                      )}
                    >
                      {tile.rankBadge.text}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 t-body tnum font-bold text-foreground">{tile.value}</div>
                <div className="t-caption tnum">{tile.sub}</div>
              </div>
            ))}
          </div>

          {/* Panel 3: Matchup Outlook */}
          <div className="flex flex-col justify-between rounded-lg border border-border-soft bg-surface-inset p-3 lg:col-span-3">
            <div className="flex items-center justify-between gap-2">
              <span className="t-colhead text-muted-foreground">Matchup</span>
              {defense ? (
                <span
                  className={cn(
                    "rounded px-1.5 py-0.5 t-caption tnum font-semibold",
                    defense.rank <= 10
                      ? "bg-edge-pos-tint text-edge-pos"
                      : defense.rank >= 23
                        ? "bg-edge-neg-tint text-edge-neg"
                        : "bg-card text-muted-foreground",
                  )}
                >
                  vs {player?.position ?? defense.position} {ordinal(defense.rank)}
                </span>
              ) : null}
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              {game ? (
                <div className="flex flex-col">
                  <Matchup home={game.home} away={game.away} />
                  <span className="t-caption">
                    {game.gameday}
                    {game.gametime ? ` ${game.gametime}` : ""}
                  </span>
                </div>
              ) : (
                <span className="t-caption">Unknown game</span>
              )}
              {opponent ? <TeamLogo team={opponent} /> : null}
            </div>
          </div>
        </div>

        {/* FantasyLabs Workspace Navigation Tabs */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border-soft pt-3">
          <ToggleGroup
            type="single"
            value={detailTab}
            onValueChange={(v) => v && setDetailTab(v as DetailTab)}
            size="sm"
            spacing={0}
            aria-label="Player detail sections"
          >
            <ToggleGroupItem value="all" className="t-caption h-8 px-3">
              All
            </ToggleGroupItem>
            <ToggleGroupItem value="home" className="t-caption h-8 px-3">
              Home
            </ToggleGroupItem>
            <ToggleGroupItem value="trends" className="t-caption h-8 px-3">
              Trends
            </ToggleGroupItem>
            <ToggleGroupItem value="gamelogs" className="t-caption h-8 px-3">
              Game Logs
            </ToggleGroupItem>
            <ToggleGroupItem value="correlations" className="t-caption h-8 px-3">
              Correlations
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </header>

      {(detailTab === "all" || detailTab === "home") && found ? (
        <PlayerIntelCard
          playerId={playerId}
          position={player?.position ?? null}
          gameId={game?.game_id ?? null}
          season={asOf?.season ?? currentSeason}
          week={asOf?.week ?? 1}
          fptsHist={fptsHist}
          usage={usage}
          defense={defense}
          news={news}
          peers={peers}
        />
      ) : null}

      {(detailTab === "all" || detailTab === "home") ? (
        <PlayerHomeCards
          actualRows={actualRows}
          projections={projections}
          simProjections={simProjections}
          fptsHist={fptsHist}
          usage={usage}
          defense={defense}
          currentSeason={currentSeason}
        />
      ) : null}

      {(detailTab === "all" || detailTab === "trends") ? (
        <UsagePanel
          usage={usage}
          position={player?.position ?? null}
          opponent={opponent}
          defense={defense}
          fptsHist={fptsHist}
        />
      ) : null}

      {(detailTab === "all" || detailTab === "home") ? <PlayerNewsCard news={news} /> : null}

      {/* When no prop lines are loaded, still display the interactive DK points histogram if available */}
      {(detailTab === "all" || detailTab === "home") && !showProps && fptsHist ? (
        <VisualHistogram
          hist={fptsHist}
          title="Simulated DraftKings points distribution"
          unit="DK pts"
        />
      ) : null}

      {(detailTab === "all" || detailTab === "gamelogs") && asOf ? (
        <PlayerAnalysis
          position={player?.position ?? null}
          season={asOf.season}
          week={asOf.week}
          log={seasonLog}
          actuals={actualRows}
          projections={projections}
          simProjections={simProjections}
        />
      ) : null}

      {detailTab === "correlations" ? (
        <section className="card p-4" aria-label="Player correlations">
          <h2 className="t-body font-semibold">When X goes over, who else does</h2>
          {corrs.length === 0 ? (
            <p className="mt-2 t-caption">No correlations on this run.</p>
          ) : (
            <div className="mt-3">
              <DataTable
                data={corrs}
                getRowId={(c) => c.a_id ?? c.a}
                empty="No correlations on this run."
                ariaLabel="Player correlations"
                syncUrl={false}
                defaultSort={{ id: "corr", dir: "desc" }}
                columns={[
                  {
                    id: "player",
                    header: "Player",
                    sortValue: (c) => c.a,
                    cell: (c) =>
                      c.a_id && game?.game_id ? (
                        <Link
                          href={`${basePath}/${game.game_id}/${c.a_id}`}
                          className="font-semibold text-foreground underline-offset-2 hover:underline"
                        >
                          {c.a}
                        </Link>
                      ) : (
                        <span className="font-semibold text-foreground">{c.a}</span>
                      ),
                  },
                  {
                    id: "corr",
                    header: "Correlation",
                    align: "right",
                    sortValue: (c) => c.corr,
                    cell: (c) => (
                      <span
                        className={cn(
                          "tnum font-semibold",
                          c.corr > 0 ? "text-edge-pos" : c.corr < 0 ? "text-edge-neg" : "text-foreground",
                        )}
                      >
                        {corrLabel(c.corr)} · {c.corr.toFixed(2)} ({signedPct(c.corr)})
                      </span>
                    ),
                  },
                  {
                    id: "avgPts",
                    header: "Avg Points",
                    align: "right",
                    sortValue: (c) => c.avg_pts,
                    cell: (c) => (
                      <span className="tnum font-semibold text-foreground">
                        {c.avg_pts != null ? c.avg_pts.toFixed(2) : "—"}
                      </span>
                    ),
                  },
                  {
                    id: "count",
                    header: "Count",
                    align: "right",
                    sortValue: (c) => c.games,
                    cell: (c) => (
                      <span className="tnum font-semibold text-foreground">
                        {c.games != null ? c.games : "—"}
                      </span>
                    ),
                  },
                ]}
              />
            </div>
          )}
        </section>
      ) : null}

      {showProps ? (
        <section className="flex flex-col gap-4" aria-label="Props">
          <div className="flex items-center justify-between gap-2">
            <h2 className="t-body font-semibold">Props</h2>
            <span className="t-caption">Select a market tile or tab to inspect the distribution</span>
          </div>

          {/* StatRankings Props Lab Market Selector Tiles */}
          {fairs.length > 1 ? (
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5" data-slot="prop-market-tiles">
              {fairs.map((f) => {
                const isSelected = f.stat === (fair?.stat ?? stat);
                const mkt = f.market_line ?? f.fair_line;
                const edgeVal = f.edge;
                return (
                  <button
                    key={f.stat}
                    type="button"
                    onClick={() => setStat(f.stat)}
                    className={cn(
                      "flex flex-col items-start justify-between gap-1 rounded-lg border p-2.5 text-left transition-colors",
                      isSelected
                        ? "border-line bg-line-tint/40"
                        : "border-border-soft bg-card hover:bg-accent",
                    )}
                  >
                    <div className="flex w-full items-center justify-between gap-1">
                      <span className="t-colhead text-muted-foreground">{STAT_LABELS[f.stat] ?? f.stat}</span>
                      {edgeVal != null ? (
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 t-caption tnum font-semibold",
                            edgeVal > 0.01
                              ? "bg-edge-pos-tint text-edge-pos"
                              : edgeVal < -0.01
                                ? "bg-edge-neg-tint text-edge-neg"
                                : "bg-surface-inset text-muted-foreground",
                          )}
                        >
                          {signedPct(edgeVal)}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex w-full items-baseline justify-between gap-2">
                      <span className="t-body tnum font-bold text-line">{mkt.toFixed(1)}</span>
                      <span className="t-caption tnum">Fair {f.fair_line.toFixed(1)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="flex flex-col gap-4 lg:flex-row">
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              <div className="card flex flex-col gap-3 p-4">
                <label className="flex max-w-xs flex-col gap-1">
                  <span className="t-colhead text-muted-foreground">Entered line</span>
                  {drawsPruned ? (
                    <p className="t-caption" role="status">
                      draws pruned for this run
                    </p>
                  ) : (
                    <>
                      <Input
                        readOnly
                        value={fair?.market_line != null ? String(fair.market_line) : ""}
                        placeholder="No line entered"
                        aria-describedby="prop-line-help"
                      />
                      <span id="prop-line-help" className="t-caption">
                        Enter a line on the Props board. Until then we use our fair line.
                      </span>
                    </>
                  )}
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
                    <ToggleGroupItem key={w} value={w} className="t-caption h-8 px-2">
                      {w}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <PropCallout sentence={sentence} lean={lean} oneSided={Boolean(fair?.one_sided)} />
              </div>
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
                    group: "RUSHING",
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
                    group: "RUSHING",
                    align: "right",
                    sortValue: (g) => weeklyValue(g.stats, "rush_yds"),
                    cell: (g) => (
                      <span className="tnum font-semibold text-foreground">{weeklyValue(g.stats, "rush_yds") ?? "—"}</span>
                    ),
                  },
                  {
                    id: "targets",
                    header: "Targets",
                    group: "RECEIVING",
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
                    group: "RECEIVING",
                    align: "right",
                    sortValue: (g) => weeklyValue(g.stats, "rec"),
                    cell: (g) => (
                      <span className="tnum font-semibold text-foreground">{weeklyValue(g.stats, "rec") ?? "—"}</span>
                    ),
                  },
                  {
                    id: "recYds",
                    header: "Rec yds",
                    group: "RECEIVING",
                    align: "right",
                    sortValue: (g) => weeklyValue(g.stats, "rec_yds"),
                    cell: (g) => (
                      <span className="tnum font-semibold text-foreground">{weeklyValue(g.stats, "rec_yds") ?? "—"}</span>
                    ),
                  },
                  {
                    id: "total",
                    header: "Total",
                    group: "TOTAL",
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
                    group: "TOTAL",
                    sortValue: (g) => (fair ? weeklyValue(g.stats, fair.stat) : null),
                    cell: (g) => {
                      const vs = fair ? weeklyValue(g.stats, fair.stat) : null;
                      return (
                        <span
                          className={cn(
                            "tnum font-semibold",
                            vs == null || line == null
                              ? "text-foreground"
                              : vs > line
                                ? "text-edge-pos"
                                : vs < line
                                  ? "text-edge-neg"
                                  : "text-foreground",
                          )}
                        >
                          {vs == null || line == null ? "—" : vs > line ? "Over" : vs < line ? "Under" : "Push"}
                        </span>
                      );
                    },
                  },
                ]}
              />
            </div>
            <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[360px]">
              <VisualHistogram
                hist={activeHist}
                line={line}
                fairLine={fair?.fair_line ?? null}
                mean={fair?.mean ?? null}
                p10={fair?.p10 ?? null}
                p25={fair?.p25 ?? null}
                p75={fair?.p75 ?? null}
                p90={fair?.p90 ?? null}
                title="Where his yards land"
              />
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
                  <div className="mt-2">
                    <DataTable
                      data={corrs}
                      getRowId={(c) => c.a_id ?? c.a}
                      empty="No correlations on this run."
                      ariaLabel="Player correlations"
                      syncUrl={false}
                      defaultSort={{ id: "corr", dir: "desc" }}
                      columns={[
                        {
                          id: "player",
                          header: "Player",
                          sortValue: (c) => c.a,
                          cell: (c) =>
                            c.a_id && game?.game_id ? (
                              <Link
                                href={`${basePath}/${game.game_id}/${c.a_id}`}
                                className="font-semibold text-foreground underline-offset-2 hover:underline"
                              >
                                {c.a}
                              </Link>
                            ) : (
                              <span className="font-semibold text-foreground">{c.a}</span>
                            ),
                        },
                        {
                          id: "corr",
                          header: "Correlation",
                          align: "right",
                          sortValue: (c) => c.corr,
                          cell: (c) => (
                            <span
                              className={cn(
                                "tnum font-semibold",
                                c.corr > 0 ? "text-edge-pos" : c.corr < 0 ? "text-edge-neg" : "text-foreground",
                              )}
                            >
                              {corrLabel(c.corr)} · {signedPct(c.corr)}
                            </span>
                          ),
                        },
                        {
                          id: "avgPts",
                          header: "Avg Points",
                          align: "right",
                          sortValue: (c) => c.avg_pts,
                          cell: (c) => (
                            <span className="tnum font-semibold text-foreground">
                              {c.avg_pts != null ? c.avg_pts.toFixed(2) : "—"}
                            </span>
                          ),
                        },
                        {
                          id: "count",
                          header: "Count",
                          align: "right",
                          sortValue: (c) => c.games,
                          cell: (c) => (
                            <span className="tnum font-semibold text-foreground">
                              {c.games != null ? c.games : "—"}
                            </span>
                          ),
                        },
                      ]}
                    />
                  </div>
                )}
              </section>
            </aside>
          </div>
        </section>
      ) : null}
    </div>
  );
}
