"use client";

import { useMemo, useState, type ReactNode } from "react";
import { GameDrawer } from "@/components/board/GameDrawer";
import { GameOutcome } from "@/components/board/GameOutcome";
import { NgsMute } from "@/components/board/NgsMute";
import { Matchup } from "@/components/board/TeamDot";
import { WeekScoreboard } from "@/components/board/WeekScoreboard";
import { MatchupFieldView } from "@/components/games/MatchupFieldView";
import { GameStrip } from "@/components/shell/GameStrip";
import { useGamesSelection } from "@/components/shell/GamesSelection";
import { DataTable } from "@/components/ui/DataTable";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { sortBoardRows } from "@/lib/board-sort";
import { diffHeatmapClass, displayValue, heatmapCellClass, homeLine, line, pct, price, signed } from "@/lib/edge";
import { selectedOnSlate } from "@/lib/games-param";
import { impliedFromLines, simScore } from "@/lib/implied";
import { kickoffLabel } from "@/lib/format";
import { toStripGame } from "@/lib/kickoff";
import type { FieldSkillPlayer, TrenchTeamRank, VegasGameSnap, VegasMovementData } from "@/lib/queries/games";
import type { WeekScoreboard as WeekScoreboardData } from "@/lib/queries/results";
import { fallbackNotice, slateGameCountLabel } from "@/lib/slate";
import type { BoardRow, GameChecks, GameDetail, VerdictPayload } from "@/lib/types";
import type { DrawerPlayer } from "@/lib/queries/players";
import { inputsForMatchup, type TeamInput } from "@/lib/team-input";
import { cn } from "@/lib/utils";
import { useGameOpen } from "@/components/board/useGameOpen";

export { simScore } from "@/lib/implied";

type GamesViewMode = "lines" | "vegas" | "trench" | "field";

type TrenchMatchupRow = {
  id: string;
  game_id: string;
  team: string;
  opponent: string;
  homeAway: "HOME" | "AWAY";
  trench: TrenchTeamRank | null;
  oppTrench: TrenchTeamRank | null;
  input: TeamInput | null;
  oppInput: TeamInput | null;
};

type VegasTeamRow = {
  id: string;
  game_id: string;
  kickoff: string;
  team: string;
  opponent: string;
  isHome: boolean;
  openScore: number | null;
  liveScore: number | null;
  scoreDiff: number | null;
  openSpread: number | null;
  liveSpread: number | null;
  spreadDiff: number | null;
  coverProb: number | null;
  openTotal: number | null;
  liveTotal: number | null;
  totalDiff: number | null;
  overProb: number | null;
  snaps: VegasGameSnap[];
};

function RankChip({ rank, of = 32 }: { rank: number | null | undefined; of?: number }) {
  if (rank == null) return null;
  const good = rank <= Math.ceil(of * 0.28);
  const bad = rank >= Math.floor(of * 0.72);
  return (
    <span
      className={cn(
        "ml-1.5 inline-flex items-center rounded px-1.5 py-0.5 t-caption tnum font-semibold",
        good && "bg-edge-pos-tint text-edge-pos",
        bad && "bg-edge-neg-tint text-edge-neg",
        !good && !bad && "bg-surface-inset text-muted-foreground",
      )}
    >
      #{rank}
    </span>
  );
}

function MovementSparkline({
  snaps,
  isHome,
  openScore,
  liveScore,
}: {
  snaps: VegasGameSnap[];
  isHome: boolean;
  openScore: number | null;
  liveScore: number | null;
}) {
  const pts = useMemo(() => {
    const derived = snaps
      .map((s) => {
        const imp = impliedFromLines(s.total_line, s.spread_line);
        if (!imp) return null;
        return isHome ? imp.home : imp.away;
      })
      .filter((v): v is number => v != null && Number.isFinite(v));

    if (derived.length >= 2) return derived;
    if (openScore != null && liveScore != null) return [openScore, liveScore];
    if (liveScore != null) return [liveScore, liveScore];
    return [21, 21];
  }, [snaps, isHome, openScore, liveScore]);

  const W = 96;
  const H = 26;
  const PAD = 4;
  const minV = Math.min(...pts) - 0.5;
  const maxV = Math.max(...pts) + 0.5;
  const span = Math.max(1, maxV - minV);

  const coords = pts.map((v, idx) => {
    const x = PAD + (idx / Math.max(1, pts.length - 1)) * (W - PAD * 2);
    const y = H - PAD - ((v - minV) / span) * (H - PAD * 2);
    return { x, y };
  });

  const delta = pts[pts.length - 1]! - pts[0]!;
  const strokeColor =
    delta > 0.1 ? "var(--edge-pos)" : delta < -0.1 ? "var(--edge-neg)" : "var(--line)";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-6 w-24 overflow-visible"
      role="img"
      aria-label="Line movement sparkline"
    >
      <polyline
        fill="none"
        stroke={strokeColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        points={coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(" ")}
      />
      {coords.map((c, idx) =>
        idx === 0 || idx === coords.length - 1 ? (
          <circle key={idx} cx={c.x} cy={c.y} r={2.2} fill={strokeColor} />
        ) : null,
      )}
    </svg>
  );
}

export function GamesList({
  week,
  rows = [],
  weekTotal,
  slateCount,
  verdicts = {},
  checks = {},
  playersByGame = {},
  skillPlayersByGame = {},
  vegasByGame = {},
  openGameId = null,
  openGameDetail = null,
  scoreboard,
  toolbar,
  fallbackFrom,
  notice,
  runCreatedAt,
  runId,
  teamInputs = {},
  trenchRanks = {},
}: {
  week?: number;
  rows?: BoardRow[];
  weekTotal?: number;
  slateCount?: number;
  verdicts?: Record<string, VerdictPayload>;
  checks?: Record<string, GameChecks>;
  playersByGame?: Record<string, DrawerPlayer[]>;
  skillPlayersByGame?: Record<string, FieldSkillPlayer[]>;
  vegasByGame?: Record<string, VegasMovementData>;
  openGameId?: string | null;
  openGameDetail?: GameDetail | null;
  scoreboard?: WeekScoreboardData;
  toolbar?: ReactNode;
  fallbackFrom?: string | null;
  notice?: string | null;
  runCreatedAt?: string | null;
  runId?: string | null;
  teamInputs?: Record<string, TeamInput>;
  trenchRanks?: Record<string, TrenchTeamRank>;
}) {
  const [localOpenId, setLocalOpenId] = useState<string | null>(openGameId);
  const setGameUrl = useGameOpen();
  const openId = localOpenId ?? openGameId;
  const setOpen = (id: string | null) => {
    setLocalOpenId(id);
    setGameUrl(id);
  };
  const [viewMode, setViewMode] = useState<GamesViewMode>("lines");
  const { selected } = useGamesSelection();
  const strip = useMemo(() => rows.map(toStripGame), [rows]);
  const ordered = useMemo(() => {
    const sorted = sortBoardRows(rows);
    const active = selectedOnSlate(
      selected,
      strip.map((g) => g.game_id),
    );
    if (!active.length) return sorted;
    const set = new Set(active);
    return sorted.filter((r) => set.has(r.game_id));
  }, [rows, selected, strip]);

  const trenchRows = useMemo<TrenchMatchupRow[]>(() => {
    const out: TrenchMatchupRow[] = [];
    for (const r of ordered) {
      out.push({
        id: `${r.game_id}-${r.away}`,
        game_id: r.game_id,
        team: r.away,
        opponent: r.home,
        homeAway: "AWAY",
        trench: trenchRanks[r.away] ?? null,
        oppTrench: trenchRanks[r.home] ?? null,
        input: teamInputs[r.away] ?? null,
        oppInput: teamInputs[r.home] ?? null,
      });
      out.push({
        id: `${r.game_id}-${r.home}`,
        game_id: r.game_id,
        team: r.home,
        opponent: r.away,
        homeAway: "HOME",
        trench: trenchRanks[r.home] ?? null,
        oppTrench: trenchRanks[r.away] ?? null,
        input: teamInputs[r.home] ?? null,
        oppInput: teamInputs[r.away] ?? null,
      });
    }
    return out;
  }, [ordered, trenchRanks, teamInputs]);

  const vegasRows = useMemo<VegasTeamRow[]>(() => {
    const out: VegasTeamRow[] = [];
    for (const r of ordered) {
      const vm = vegasByGame[r.game_id];
      const openTotal = vm?.open_total ?? r.run_market_total ?? r.total_line ?? null;
      const liveTotal = vm?.live_total ?? r.total_line ?? null;
      const openSpreadNfl = vm?.open_spread ?? r.run_market_spread ?? r.spread_line ?? null;
      const liveSpreadNfl = vm?.live_spread ?? r.spread_line ?? null;

      const openImp = impliedFromLines(openTotal, openSpreadNfl);
      const liveImp = impliedFromLines(liveTotal, liveSpreadNfl);

      const homeOpenBook = openSpreadNfl != null ? homeLine(openSpreadNfl) : null;
      const homeLiveBook = liveSpreadNfl != null ? homeLine(liveSpreadNfl) : null;
      const awayOpenBook = homeOpenBook != null ? -homeOpenBook : null;
      const awayLiveBook = homeLiveBook != null ? -homeLiveBook : null;

      const totalDiff =
        openTotal != null && liveTotal != null ? liveTotal - openTotal : null;

      const ko = kickoffLabel(r.gameday, r.gametime);

      // Away row
      out.push({
        id: `${r.game_id}-${r.away}`,
        game_id: r.game_id,
        kickoff: ko,
        team: r.away,
        opponent: `@ ${r.home}`,
        isHome: false,
        openScore: openImp ? openImp.away : null,
        liveScore: liveImp ? liveImp.away : null,
        scoreDiff: openImp && liveImp ? liveImp.away - openImp.away : null,
        openSpread: awayOpenBook,
        liveSpread: awayLiveBook,
        spreadDiff:
          awayOpenBook != null && awayLiveBook != null ? awayLiveBook - awayOpenBook : null,
        coverProb: r.p_home_cover_market != null ? 1 - r.p_home_cover_market : null,
        openTotal,
        liveTotal,
        totalDiff,
        overProb: r.p_over_market,
        snaps: vm?.snaps ?? [],
      });

      // Home row
      out.push({
        id: `${r.game_id}-${r.home}`,
        game_id: r.game_id,
        kickoff: ko,
        team: r.home,
        opponent: `vs ${r.away}`,
        isHome: true,
        openScore: openImp ? openImp.home : null,
        liveScore: liveImp ? liveImp.home : null,
        scoreDiff: openImp && liveImp ? liveImp.home - openImp.home : null,
        openSpread: homeOpenBook,
        liveSpread: homeLiveBook,
        spreadDiff:
          homeOpenBook != null && homeLiveBook != null ? homeLiveBook - homeOpenBook : null,
        coverProb: r.p_home_cover_market,
        openTotal,
        liveTotal,
        totalDiff,
        overProb: r.p_over_market != null ? 1 - r.p_over_market : null,
        snaps: vm?.snaps ?? [],
      });
    }
    return out;
  }, [ordered, vegasByGame]);

  const open = ordered.find((r) => r.game_id === openId) ?? rows.find((r) => r.game_id === openId) ?? null;
  const total = weekTotal ?? rows.length;
  const onSlate = slateCount ?? rows.length;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="t-title">Games</h1>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as GamesViewMode)}
            size="sm"
            spacing={0}
            aria-label="Games view mode"
          >
            <ToggleGroupItem value="lines" className="t-caption h-8 px-3">
              Game lines
            </ToggleGroupItem>
            <ToggleGroupItem value="vegas" className="t-caption h-8 px-3">
              Vegas Movement
            </ToggleGroupItem>
            <ToggleGroupItem value="trench" className="t-caption h-8 px-3">
              Trench &amp; OL Rankings
            </ToggleGroupItem>
            <ToggleGroupItem value="field" className="t-caption h-8 px-3">
              Matchup Field
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        {toolbar}
        {notice ? (
          <p className="t-body text-foreground" role="note">
            {notice}
          </p>
        ) : null}
        {fallbackFrom ? <p className="t-caption text-warn">{fallbackNotice(fallbackFrom)}</p> : null}
        <p className="t-caption">
          {week != null ? `Week ${week}. ` : ""}
          {total > 0 ? `${slateGameCountLabel(onSlate, total)} ` : ""}
          {viewMode === "trench"
            ? "Offensive line pass protection, EPA per dropback, PROE, neutral pass rate, and opposing pass-rush mismatch from raw.team_game_agg (strictly prior weeks)."
            : viewMode === "vegas"
              ? "Opening vs live implied team totals, spreads, over/unders, and snapshot movement sparklines from raw.market_lines."
              : viewMode === "field"
                ? "Interactive skill player formation cards (Mth vs Yr market shares) and Offense vs Defense butterfly comparison bars."
                : runId
                  ? "Sim score summary from the same draws as the Edge board. Click a row for the game drawer."
                  : "Click a row for the game drawer."}
        </p>
      </header>
      {strip.length ? <GameStrip games={strip} /> : null}
      {scoreboard ? <WeekScoreboard board={scoreboard} /> : null}

      {viewMode === "lines" ? (
        <DataTable
          data={ordered}
          getRowId={(r) => r.game_id}
          empty="No games listed yet"
          ariaLabel="Games"
          searchPlaceholder="Team"
          onRowClick={(r) => setOpen(r.game_id)}
          filters={{
            search: (r, q) =>
              r.home.toLowerCase().includes(q) ||
              r.away.toLowerCase().includes(q) ||
              r.game_id.toLowerCase().includes(q),
          }}
          rowProps={(r) => ({
            className: cn("cursor-pointer", !r.has_started && "h-11"),
          })}
          columns={[
            {
              id: "matchup",
              header: "Matchup",
              sortValue: (r) => `${r.away} ${r.home}`,
              cell: (r) => <Matchup home={r.home} away={r.away} />,
            },
            {
              id: "kickoff",
              header: "Kickoff",
              sortValue: (r) => `${r.gameday ?? ""} ${r.gametime ?? ""}`,
              cell: (r) => <span className="t-caption">{kickoffLabel(r.gameday, r.gametime)}</span>,
            },
            {
              id: "result",
              header: "Result",
              sortValue: (r) => (r.is_final ? 2 : r.has_started ? 1 : 0),
              cell: (r) =>
                r.has_started ? <GameOutcome row={r} compact /> : <span className="t-caption">—</span>,
            },
            {
              id: "sim",
              header: "Sim score",
              group: "SIMULATION",
              align: "right",
              sortValue: (r) => simScore(r)?.home ?? null,
              cell: (r) => {
                const sc = simScore(r);
                return (
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="tnum font-semibold text-foreground">
                      {sc ? `${sc.away.toFixed(1)}–${sc.home.toFixed(1)}` : "—"}
                    </span>
                    <NgsMute away={r.ngs_away_pts} home={r.ngs_home_pts} pWin={r.ngs_p_home_win} />
                  </span>
                );
              },
            },
            {
              id: "spread",
              header: "Fair spread",
              group: "SPREAD",
              align: "right",
              sortValue: (r) => displayValue(r.mean_spread, r.fair_spread),
              cell: (r) => {
                const spread = displayValue(r.mean_spread, r.fair_spread);
                return (
                  <span className="tnum font-semibold text-foreground">
                    {spread == null ? "—" : line(homeLine(spread))}
                  </span>
                );
              },
            },
            {
              id: "mspread",
              header: "Market spread",
              group: "SPREAD",
              align: "right",
              sortValue: (r) => r.spread_line,
              cell: (r) => (
                <span className="tnum font-semibold text-line">
                  {r.spread_line == null ? "—" : line(homeLine(r.spread_line))}
                </span>
              ),
            },
            {
              id: "total",
              header: "Fair total",
              group: "TOTAL",
              align: "right",
              sortValue: (r) => displayValue(r.mean_total, r.fair_total),
              cell: (r) => {
                const tot = displayValue(r.mean_total, r.fair_total);
                return (
                  <span className="tnum font-semibold text-foreground">{tot == null ? "—" : tot.toFixed(1)}</span>
                );
              },
            },
            {
              id: "mtotal",
              header: "Market total",
              group: "TOTAL",
              align: "right",
              sortValue: (r) => r.total_line,
              cell: (r) => (
                <span className="tnum font-semibold text-line">
                  {r.total_line == null ? "—" : r.total_line.toFixed(1)}
                </span>
              ),
            },
            {
              id: "ml",
              header: "Moneyline",
              group: "MONEYLINE",
              align: "right",
              sortValue: (r) => r.home_moneyline,
              cell: (r) => (
                <span className="tnum font-semibold text-line">
                  {r.away} {price(r.away_moneyline)} {r.home} {price(r.home_moneyline)}
                </span>
              ),
            },
          ]}
        />
      ) : viewMode === "vegas" ? (
        <DataTable
          data={vegasRows}
          getRowId={(r) => r.id}
          empty="No games listed yet"
          ariaLabel="Vegas line movement"
          searchPlaceholder="Team"
          syncUrl={false}
          onRowClick={(r) => setOpen(r.game_id)}
          filters={{
            search: (r, q) =>
              r.team.toLowerCase().includes(q) || r.opponent.toLowerCase().includes(q),
          }}
          columns={[
            {
              id: "kickoff",
              header: "Time",
              sortValue: (r) => r.kickoff,
              cell: (r) => <span className="t-caption">{r.kickoff}</span>,
            },
            {
              id: "team",
              header: "Team",
              sortValue: (r) => r.team,
              cell: (r) => (
                <span className="inline-flex items-center gap-1.5">
                  <TeamLogo team={r.team} />
                  <span className="t-caption text-muted-foreground">{r.opponent}</span>
                </span>
              ),
            },
            {
              id: "scoreOpen",
              header: "Open",
              group: "SCORE",
              align: "right",
              sortValue: (r) => r.openScore,
              cell: (r) => (
                <span className="tnum font-semibold text-foreground">
                  {r.openScore != null ? r.openScore.toFixed(1) : "—"}
                </span>
              ),
            },
            {
              id: "scoreLive",
              header: "Live",
              group: "SCORE",
              align: "right",
              sortValue: (r) => r.liveScore,
              cell: (r) => {
                const scorePct =
                  r.liveScore != null ? Math.min(1, Math.max(0, (r.liveScore - 16) / 14)) : null;
                return (
                  <span
                    className={cn(
                      "inline-block rounded-sm px-1.5 py-0.5 tnum font-bold",
                      heatmapCellClass(scorePct),
                    )}
                  >
                    {r.liveScore != null ? r.liveScore.toFixed(1) : "—"}
                  </span>
                );
              },
            },
            {
              id: "scoreDiff",
              header: "Diff",
              group: "SCORE",
              align: "right",
              sortValue: (r) => r.scoreDiff,
              cell: (r) => (
                <span
                  className={cn(
                    "inline-block rounded-sm px-1.5 py-0.5 tnum font-semibold",
                    diffHeatmapClass(r.scoreDiff, 0.2),
                  )}
                >
                  {r.scoreDiff != null ? signed(r.scoreDiff, 1) : "—"}
                </span>
              ),
            },
            {
              id: "spreadOpen",
              header: "Open",
              group: "SPREAD",
              align: "right",
              sortValue: (r) => r.openSpread,
              cell: (r) => (
                <span className="tnum font-semibold text-foreground">
                  {r.openSpread != null ? line(r.openSpread) : "—"}
                </span>
              ),
            },
            {
              id: "spreadLive",
              header: "Live",
              group: "SPREAD",
              align: "right",
              sortValue: (r) => r.liveSpread,
              cell: (r) => (
                <span className="tnum font-semibold text-line">
                  {r.liveSpread != null ? line(r.liveSpread) : "—"}
                </span>
              ),
            },
            {
              id: "spreadDiff",
              header: "Diff",
              group: "SPREAD",
              align: "right",
              sortValue: (r) => r.spreadDiff,
              cell: (r) => (
                <span
                  className={cn(
                    "inline-block rounded-sm px-1.5 py-0.5 tnum font-semibold",
                    diffHeatmapClass(r.spreadDiff != null ? -r.spreadDiff : null, 0.2),
                  )}
                >
                  {r.spreadDiff != null ? signed(r.spreadDiff, 1) : "—"}
                </span>
              ),
            },
            {
              id: "coverPct",
              header: "Sim Cover %",
              group: "SPREAD",
              align: "right",
              sortValue: (r) => r.coverProb,
              cell: (r) => (
                <span className="tnum font-semibold text-foreground">{pct(r.coverProb)}</span>
              ),
            },
            {
              id: "totalOpen",
              header: "Open",
              group: "OVER/UNDER",
              align: "right",
              sortValue: (r) => r.openTotal,
              cell: (r) => (
                <span className="tnum font-semibold text-foreground">
                  {r.openTotal != null ? r.openTotal.toFixed(1) : "—"}
                </span>
              ),
            },
            {
              id: "totalLive",
              header: "Live",
              group: "OVER/UNDER",
              align: "right",
              sortValue: (r) => r.liveTotal,
              cell: (r) => {
                const totPct =
                  r.liveTotal != null ? Math.min(1, Math.max(0, (r.liveTotal - 38) / 14)) : null;
                return (
                  <span
                    className={cn(
                      "inline-block rounded-sm px-1.5 py-0.5 tnum font-bold",
                      heatmapCellClass(totPct),
                    )}
                  >
                    {r.liveTotal != null ? r.liveTotal.toFixed(1) : "—"}
                  </span>
                );
              },
            },
            {
              id: "totalDiff",
              header: "Diff",
              group: "OVER/UNDER",
              align: "right",
              sortValue: (r) => r.totalDiff,
              cell: (r) => (
                <span
                  className={cn(
                    "inline-block rounded-sm px-1.5 py-0.5 tnum font-semibold",
                    diffHeatmapClass(r.totalDiff, 0.2),
                  )}
                >
                  {r.totalDiff != null ? signed(r.totalDiff, 1) : "—"}
                </span>
              ),
            },
            {
              id: "movement",
              header: "Movement",
              sortable: false,
              cell: (r) => (
                <MovementSparkline
                  snaps={r.snaps}
                  isHome={r.isHome}
                  openScore={r.openScore}
                  liveScore={r.liveScore}
                />
              ),
            },
          ]}
        />
      ) : viewMode === "trench" ? (
        <DataTable
          data={trenchRows}
          getRowId={(r) => r.id}
          empty="No trench rankings available for this slate"
          ariaLabel="Trench and OL rankings"
          searchPlaceholder="Team"
          syncUrl={false}
          defaultSort={{ id: "sackRate", dir: "asc" }}
          onRowClick={(r) => setOpen(r.game_id)}
          filters={{
            search: (r, q) =>
              r.team.toLowerCase().includes(q) || r.opponent.toLowerCase().includes(q),
          }}
          columns={[
            {
              id: "team",
              header: "Offense",
              sortValue: (r) => r.team,
              cell: (r) => (
                <span className="inline-flex items-center gap-2">
                  <TeamLogo team={r.team} />
                  <span className="t-caption">{r.homeAway === "AWAY" ? `@ ${r.opponent}` : `vs ${r.opponent}`}</span>
                </span>
              ),
            },
            {
              id: "sackRate",
              header: "Sack % allowed",
              group: "PASS PROTECTION (OL)",
              align: "right",
              sortValue: (r) => r.trench?.sack_rate_allowed ?? null,
              cell: (r) => (
                <span className="tnum font-semibold text-foreground">
                  {r.trench?.sack_rate_allowed != null
                    ? `${(r.trench.sack_rate_allowed * 100).toFixed(1)}%`
                    : "—"}
                  <RankChip rank={r.trench?.sack_rate_rank} of={r.trench?.of_teams} />
                </span>
              ),
            },
            {
              id: "epaDb",
              header: "Pass EPA / DB",
              group: "PASS PROTECTION (OL)",
              align: "right",
              sortValue: (r) => r.trench?.epa_per_dropback ?? null,
              cell: (r) => (
                <span className="tnum font-semibold text-foreground">
                  {r.trench?.epa_per_dropback != null
                    ? (r.trench.epa_per_dropback >= 0 ? "+" : "") + r.trench.epa_per_dropback.toFixed(2)
                    : "—"}
                  <RankChip rank={r.trench?.epa_db_rank} of={r.trench?.of_teams} />
                </span>
              ),
            },
            {
              id: "oppDefSack",
              header: "Opp DL sack %",
              group: "TRENCH MISMATCH",
              align: "right",
              sortValue: (r) => r.oppTrench?.def_sack_rate ?? null,
              cell: (r) => (
                <span className="tnum font-semibold text-foreground">
                  {r.oppTrench?.def_sack_rate != null
                    ? `${(r.oppTrench.def_sack_rate * 100).toFixed(1)}%`
                    : "—"}
                  <RankChip rank={r.oppTrench?.def_sack_rank} of={r.oppTrench?.of_teams} />
                </span>
              ),
            },
            {
              id: "oppDefEpa",
              header: "Opp pass EPA allowed",
              group: "TRENCH MISMATCH",
              align: "right",
              sortValue: (r) => r.oppTrench?.def_epa_per_dropback ?? null,
              cell: (r) => (
                <span className="tnum font-semibold text-foreground">
                  {r.oppTrench?.def_epa_per_dropback != null
                    ? (r.oppTrench.def_epa_per_dropback >= 0 ? "+" : "") +
                      r.oppTrench.def_epa_per_dropback.toFixed(2)
                    : "—"}
                  <RankChip rank={r.oppTrench?.def_epa_db_rank} of={r.oppTrench?.of_teams} />
                </span>
              ),
            },
            {
              id: "neutralPass",
              header: "Neutral pass %",
              group: "TENDENCIES & PACE",
              align: "right",
              sortValue: (r) => r.trench?.neutral_pass_rate ?? null,
              cell: (r) => (
                <span className="tnum font-semibold text-foreground">
                  {r.trench?.neutral_pass_rate != null
                    ? `${(r.trench.neutral_pass_rate * 100).toFixed(1)}%`
                    : "—"}
                  <RankChip rank={r.trench?.neutral_pass_rank} of={r.trench?.of_teams} />
                </span>
              ),
            },
            {
              id: "proe",
              header: "PROE",
              group: "TENDENCIES & PACE",
              align: "right",
              sortValue: (r) => r.trench?.proe ?? null,
              cell: (r) => {
                const v = r.trench?.proe;
                return (
                  <span className="tnum font-semibold text-foreground">
                    {v != null ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%` : "—"}
                    <RankChip rank={r.trench?.proe_rank} of={r.trench?.of_teams} />
                  </span>
                );
              },
            },
            {
              id: "playsPerDrive",
              header: "Plays / drive",
              group: "TENDENCIES & PACE",
              align: "right",
              sortValue: (r) => r.trench?.plays_per_drive ?? null,
              cell: (r) => (
                <span className="tnum font-semibold text-foreground">
                  {r.trench?.plays_per_drive != null ? r.trench.plays_per_drive.toFixed(2) : "—"}
                  <RankChip rank={r.trench?.pace_rank} of={r.trench?.of_teams} />
                </span>
              ),
            },
            {
              id: "offPpd",
              header: "Adj pts / drive",
              group: "SIMULATION PRIORS",
              align: "right",
              sortValue: (r) => r.input?.off_ppd_adj ?? null,
              cell: (r) => (
                <span className="tnum font-semibold text-foreground">
                  {r.input?.off_ppd_adj != null ? r.input.off_ppd_adj.toFixed(2) : "—"}
                </span>
              ),
            },
          ]}
        />
      ) : (
        <MatchupFieldView
          games={ordered}
          skillPlayersByGame={skillPlayersByGame}
          playersByGame={playersByGame}
          trenchRanks={trenchRanks}
          teamInputs={teamInputs}
          vegasByGame={vegasByGame}
        />
      )}

      <GameDrawer
        row={open}
        verdict={open ? (verdicts[open.game_id] ?? null) : null}
        checks={open ? (checks[open.game_id] ?? null) : null}
        players={open ? (playersByGame[open.game_id] ?? []) : []}
        detail={open && open.game_id === openGameId ? openGameDetail : null}
        runCreatedAt={runCreatedAt}
        runId={runId}
        scheduleOnly={!runId}
        teamInputs={open ? inputsForMatchup(teamInputs, open.away, open.home) : {}}
        open={open != null}
        onOpenChange={(v) => {
          if (!v) setOpen(null);
        }}
      />
    </div>
  );
}
