"use client";

import { useMemo, useState, type ReactNode } from "react";
import { GameDrawer } from "@/components/board/GameDrawer";
import { GameOutcome } from "@/components/board/GameOutcome";
import { NgsMute } from "@/components/board/NgsMute";
import { Matchup } from "@/components/board/TeamDot";
import { WeekScoreboard } from "@/components/board/WeekScoreboard";
import { GameStrip } from "@/components/shell/GameStrip";
import { useGamesSelection } from "@/components/shell/GamesSelection";
import { DataTable } from "@/components/ui/DataTable";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { sortBoardRows } from "@/lib/board-sort";
import { displayValue, homeLine, line, price } from "@/lib/edge";
import { selectedOnSlate } from "@/lib/games-param";
import { simScore } from "@/lib/implied";
import { kickoffLabel } from "@/lib/format";
import { toStripGame } from "@/lib/kickoff";
import type { TrenchTeamRank } from "@/lib/queries/games";
import type { WeekScoreboard as WeekScoreboardData } from "@/lib/queries/results";
import { fallbackNotice, slateGameCountLabel } from "@/lib/slate";
import type { BoardRow, GameChecks, VerdictPayload } from "@/lib/types";
import type { DrawerPlayer } from "@/lib/queries/players";
import { inputsForMatchup, type TeamInput } from "@/lib/team-input";
import { cn } from "@/lib/utils";

export { simScore } from "@/lib/implied";

type GamesViewMode = "lines" | "trench";

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

export function GamesList({
  week,
  rows = [],
  weekTotal,
  slateCount,
  verdicts = {},
  checks = {},
  playersByGame = {},
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
  scoreboard?: WeekScoreboardData;
  toolbar?: ReactNode;
  fallbackFrom?: string | null;
  notice?: string | null;
  runCreatedAt?: string | null;
  runId?: string | null;
  teamInputs?: Record<string, TeamInput>;
  trenchRanks?: Record<string, TrenchTeamRank>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
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
            <ToggleGroupItem value="trench" className="t-caption h-8 px-3">
              Trench &amp; OL Rankings
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
          onRowClick={(r) => setOpenId(r.game_id)}
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
      ) : (
        <DataTable
          data={trenchRows}
          getRowId={(r) => r.id}
          empty="No trench rankings available for this slate"
          ariaLabel="Trench and OL rankings"
          searchPlaceholder="Team"
          syncUrl={false}
          defaultSort={{ id: "sackRate", dir: "asc" }}
          onRowClick={(r) => setOpenId(r.game_id)}
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
      )}

      <GameDrawer
        row={open}
        verdict={open ? (verdicts[open.game_id] ?? null) : null}
        checks={open ? (checks[open.game_id] ?? null) : null}
        players={open ? (playersByGame[open.game_id] ?? []) : []}
        runCreatedAt={runCreatedAt}
        runId={runId}
        scheduleOnly={!runId}
        teamInputs={open ? inputsForMatchup(teamInputs, open.away, open.home) : {}}
        open={open != null}
        onOpenChange={(v) => {
          if (!v) setOpenId(null);
        }}
      />
    </div>
  );
}
