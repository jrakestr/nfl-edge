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
import { sortBoardRows } from "@/lib/board-sort";
import { displayValue, homeLine, line, price } from "@/lib/edge";
import { selectedOnSlate } from "@/lib/games-param";
import { simScore } from "@/lib/implied";
import { kickoffLabel } from "@/lib/format";
import { toStripGame } from "@/lib/kickoff";
import type { WeekScoreboard as WeekScoreboardData } from "@/lib/queries/results";
import { fallbackNotice, slateGameCountLabel } from "@/lib/slate";
import type { BoardRow, GameChecks, VerdictPayload } from "@/lib/types";
import type { DrawerPlayer } from "@/lib/queries/players";
import { inputsForMatchup, type TeamInput } from "@/lib/team-input";
import { cn } from "@/lib/utils";

export { simScore } from "@/lib/implied";

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
}) {
  const [openId, setOpenId] = useState<string | null>(null);
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
  const open = ordered.find((r) => r.game_id === openId) ?? rows.find((r) => r.game_id === openId) ?? null;
  const total = weekTotal ?? rows.length;
  const onSlate = slateCount ?? rows.length;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <h1 className="t-title">Games</h1>
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
          {runId
            ? "Sim score summary from the same draws as the Edge board. Click a row for the game drawer."
            : "Click a row for the game drawer."}
        </p>
      </header>
      {strip.length ? <GameStrip games={strip} /> : null}
      {scoreboard ? <WeekScoreboard board={scoreboard} /> : null}
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
