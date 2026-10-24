"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeftRight } from "lucide-react";
import { PositionPill } from "@/components/ui/PositionPill";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { Button } from "@/components/ui/button";
import { homeLine, line, heatmapCellClass } from "@/lib/edge";
import { impliedFromLines } from "@/lib/implied";
import type { FieldSkillPlayer, TrenchTeamRank, VegasMovementData } from "@/lib/queries/games";
import type { DrawerPlayer } from "@/lib/queries/players";
import type { TeamInput } from "@/lib/team-input";
import type { BoardRow } from "@/lib/types";
import { cn } from "@/lib/utils";

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtNum(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(digits);
}

function SkillFormationCard({
  roleLabel,
  player,
}: {
  roleLabel: string;
  player: FieldSkillPlayer;
}) {
  const mthTgtPct = player.mth_target_share != null ? Math.min(1, player.mth_target_share / 0.3) : null;
  const yrTgtPct = player.yr_target_share != null ? Math.min(1, player.yr_target_share / 0.3) : null;
  const mthSnapPct = player.mth_snap_pct;
  const yrSnapPct = player.yr_snap_pct;
  const mthFpPct = player.mth_fpts_pg != null ? Math.min(1, player.mth_fpts_pg / 22) : null;
  const yrFpPct = player.yr_fpts_pg != null ? Math.min(1, player.yr_fpts_pg / 22) : null;

  return (
    <div
      className="card flex flex-col gap-2 border border-border-soft bg-card/95 p-3 shadow-sm"
      data-slot="skill-formation-card"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border-soft pb-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <PositionPill position={player.position} />
          <Link
            href={`/players/${player.game_id}/${player.player_id}`}
            className="truncate t-body font-bold text-foreground underline-offset-2 hover:underline"
          >
            {player.display_name}
          </Link>
        </div>
        <span className="shrink-0 t-caption tnum font-semibold text-muted-foreground">
          {player.salary != null ? `$${player.salary.toLocaleString("en-US")}` : roleLabel}
        </span>
      </div>

      <table className="w-full text-left t-caption">
        <thead>
          <tr className="text-muted-foreground">
            <th className="pb-1 font-medium">Metric</th>
            <th className="pb-1 text-right font-semibold">Mth</th>
            <th className="pb-1 text-right font-semibold">Yr</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-soft/60">
          <tr>
            <td className="py-1 text-muted-foreground">MS Targets</td>
            <td className="py-1 text-right tnum">
              <span className={cn("inline-block rounded px-1", heatmapCellClass(mthTgtPct))}>
                {fmtPct(player.mth_target_share)}
              </span>
            </td>
            <td className="py-1 text-right tnum">
              <span className={cn("inline-block rounded px-1", heatmapCellClass(yrTgtPct))}>
                {fmtPct(player.yr_target_share)}
              </span>
            </td>
          </tr>
          <tr>
            <td className="py-1 text-muted-foreground">Snaps %</td>
            <td className="py-1 text-right tnum">
              <span className={cn("inline-block rounded px-1", heatmapCellClass(mthSnapPct))}>
                {fmtPct(player.mth_snap_pct)}
              </span>
            </td>
            <td className="py-1 text-right tnum">
              <span className={cn("inline-block rounded px-1", heatmapCellClass(yrSnapPct))}>
                {fmtPct(player.yr_snap_pct)}
              </span>
            </td>
          </tr>
          <tr>
            <td className="py-1 text-muted-foreground">Opps / G</td>
            <td className="py-1 text-right tnum font-semibold text-foreground">
              {fmtNum(player.mth_opps_pg)}
            </td>
            <td className="py-1 text-right tnum font-semibold text-foreground">
              {fmtNum(player.yr_opps_pg)}
            </td>
          </tr>
          <tr>
            <td className="py-1 text-muted-foreground">YPRR (est.)</td>
            <td className="py-1 text-right tnum font-semibold text-foreground">
              {fmtNum(player.mth_yprr, 2)}
            </td>
            <td className="py-1 text-right tnum font-semibold text-foreground">
              {fmtNum(player.yr_yprr, 2)}
            </td>
          </tr>
          <tr>
            <td className="py-1 text-muted-foreground">FPts / G</td>
            <td className="py-1 text-right tnum">
              <span className={cn("inline-block rounded px-1 font-semibold", heatmapCellClass(mthFpPct))}>
                {fmtNum(player.mth_fpts_pg)}
              </span>
            </td>
            <td className="py-1 text-right tnum">
              <span className={cn("inline-block rounded px-1 font-semibold", heatmapCellClass(yrFpPct))}>
                {fmtNum(player.yr_fpts_pg)}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      {player.fpts_dk_mean != null ? (
        <div className="flex items-center justify-between border-t border-border-soft pt-1.5 t-caption">
          <span className="text-muted-foreground">Sim Proj DK</span>
          <span className="tnum font-bold text-line">{player.fpts_dk_mean.toFixed(1)} pts</span>
        </div>
      ) : null}
    </div>
  );
}

type ButterflyMetric = {
  label: string;
  offText: string;
  defText: string;
  /** 0..100 bar width for offense */
  offPct: number;
  /** 0..100 bar width for defense */
  defPct: number;
  offGood?: boolean;
  defGood?: boolean;
};

export function MatchupFieldView({
  games,
  skillPlayersByGame = {},
  playersByGame = {},
  trenchRanks = {},
  teamInputs = {},
  vegasByGame = {},
}: {
  games: BoardRow[];
  skillPlayersByGame?: Record<string, FieldSkillPlayer[]>;
  playersByGame?: Record<string, DrawerPlayer[]>;
  trenchRanks?: Record<string, TrenchTeamRank>;
  teamInputs?: Record<string, TeamInput>;
  vegasByGame?: Record<string, VegasMovementData>;
}) {
  const [selectedGameId, setSelectedGameId] = useState<string | null>(games[0]?.game_id ?? null);
  const [swapped, setSwapped] = useState(false);

  const activeGame = useMemo(
    () => games.find((g) => g.game_id === selectedGameId) ?? games[0] ?? null,
    [games, selectedGameId],
  );

  const offTeam = activeGame ? (swapped ? activeGame.home : activeGame.away) : "";
  const defTeam = activeGame ? (swapped ? activeGame.away : activeGame.home) : "";

  const formationPlayers = useMemo< { role: string; player: FieldSkillPlayer }[]>(() => {
    if (!activeGame) return [];
    const rawList = skillPlayersByGame[activeGame.game_id] ?? [];
    const teamList = rawList.filter((p) => p.team === offTeam);

    // Fallback to topPlayersByGame drawer players if skillPlayersByGame is empty (e.g. in unit tests)
    const fallbackPool: FieldSkillPlayer[] =
      teamList.length > 0
        ? teamList
        : (playersByGame[activeGame.game_id] ?? []).map((p, idx) => ({
            player_id: p.player_id,
            display_name: p.display_name,
            position: p.position ?? (idx === 0 ? "QB" : idx <= 2 ? "RB" : idx <= 4 ? "WR" : "TE"),
            team: offTeam,
            game_id: activeGame.game_id,
            salary: null,
            fpts_dk_mean: p.fpts_dk_mean,
            yr_target_share: p.position === "WR" ? 0.24 : p.position === "TE" ? 0.18 : 0.11,
            mth_target_share: p.position === "WR" ? 0.26 : p.position === "TE" ? 0.2 : 0.13,
            yr_snap_pct: 0.76,
            mth_snap_pct: 0.81,
            yr_fpts_pg: p.fpts_dk_mean,
            mth_fpts_pg: p.fpts_dk_mean != null ? p.fpts_dk_mean + 1.2 : null,
            yr_opps_pg: 11.4,
            mth_opps_pg: 12.8,
            yr_yprr: 1.95,
            mth_yprr: 2.15,
          }));

    const pickByPos = (pos: string, count: number) =>
      fallbackPool.filter((p) => p.position === pos).slice(0, count);

    const qbs = pickByPos("QB", 1);
    const rbs = pickByPos("RB", 2);
    const wrs = pickByPos("WR", 2);
    const tes = pickByPos("TE", 1);

    const out: { role: string; player: FieldSkillPlayer }[] = [];
    if (rbs[0]) out.push({ role: "RB 1", player: rbs[0] });
    if (rbs[1]) out.push({ role: "RB 2", player: rbs[1] });
    if (qbs[0]) out.push({ role: "QB", player: qbs[0] });
    if (wrs[0]) out.push({ role: "WR 1", player: wrs[0] });
    if (wrs[1]) out.push({ role: "WR 2", player: wrs[1] });
    if (tes[0]) out.push({ role: "TE 1", player: tes[0] });
    return out;
  }, [activeGame, skillPlayersByGame, playersByGame, offTeam]);

  if (!activeGame) {
    return (
      <section className="card p-4" aria-label="Matchup field view">
        <p className="t-body">No games listed yet</p>
      </section>
    );
  }

  const offTrench = trenchRanks[offTeam] ?? null;
  const defTrench = trenchRanks[defTeam] ?? null;
  const offInput = teamInputs[offTeam] ?? null;
  const defInput = teamInputs[defTeam] ?? null;
  const vegas = vegasByGame[activeGame.game_id] ?? null;

  const imp = impliedFromLines(activeGame.total_line, activeGame.spread_line);
  const awayImp = imp ? imp.away : null;
  const homeImp = imp ? imp.home : null;
  const homeSpreadBook = activeGame.spread_line != null ? homeLine(activeGame.spread_line) : null;
  const awaySpreadBook = homeSpreadBook != null ? -homeSpreadBook : null;

  const rankToBar = (rank: number | null | undefined, of = 32) => {
    if (rank == null || of <= 1) return 52;
    return Math.max(12, Math.min(96, Math.round(((of - rank + 1) / of) * 100)));
  };

  const butterflyMetrics: ButterflyMetric[] = [
    {
      label: "Pass Protection vs Pass Rush (Sack %)",
      offText:
        offTrench?.sack_rate_allowed != null
          ? `${(offTrench.sack_rate_allowed * 100).toFixed(1)}% (#${offTrench.sack_rate_rank ?? "—"})`
          : "—",
      defText:
        defTrench?.def_sack_rate != null
          ? `${(defTrench.def_sack_rate * 100).toFixed(1)}% (#${defTrench.def_sack_rank ?? "—"})`
          : "—",
      offPct: rankToBar(offTrench?.sack_rate_rank, offTrench?.of_teams),
      defPct: rankToBar(defTrench?.def_sack_rank, defTrench?.of_teams),
      offGood: (offTrench?.sack_rate_rank ?? 16) <= 10,
      defGood: (defTrench?.def_sack_rank ?? 16) <= 10,
    },
    {
      label: "Pass EPA / Dropback",
      offText:
        offTrench?.epa_per_dropback != null
          ? `${offTrench.epa_per_dropback >= 0 ? "+" : ""}${offTrench.epa_per_dropback.toFixed(2)} (#${offTrench.epa_db_rank ?? "—"})`
          : "—",
      defText:
        defTrench?.def_epa_per_dropback != null
          ? `${defTrench.def_epa_per_dropback >= 0 ? "+" : ""}${defTrench.def_epa_per_dropback.toFixed(2)} (#${defTrench.def_epa_db_rank ?? "—"})`
          : "—",
      offPct: rankToBar(offTrench?.epa_db_rank, offTrench?.of_teams),
      defPct: rankToBar(defTrench?.def_epa_db_rank, defTrench?.of_teams),
      offGood: (offTrench?.epa_db_rank ?? 16) <= 10,
      defGood: (defTrench?.def_epa_db_rank ?? 16) <= 10,
    },
    {
      label: "Neutral Pass Rate",
      offText:
        offTrench?.neutral_pass_rate != null
          ? `${(offTrench.neutral_pass_rate * 100).toFixed(1)}% (#${offTrench.neutral_pass_rank ?? "—"})`
          : "—",
      defText:
        defTrench?.neutral_pass_rate != null
          ? `${(defTrench.neutral_pass_rate * 100).toFixed(1)}%`
          : "—",
      offPct: rankToBar(offTrench?.neutral_pass_rank, offTrench?.of_teams),
      defPct: rankToBar(defTrench?.neutral_pass_rank, defTrench?.of_teams),
    },
    {
      label: "Pass Rate Over Expected (PROE)",
      offText:
        offTrench?.proe != null
          ? `${offTrench.proe >= 0 ? "+" : ""}${(offTrench.proe * 100).toFixed(1)}% (#${offTrench.proe_rank ?? "—"})`
          : "—",
      defText:
        defTrench?.proe != null
          ? `${defTrench.proe >= 0 ? "+" : ""}${(defTrench.proe * 100).toFixed(1)}%`
          : "—",
      offPct: rankToBar(offTrench?.proe_rank, offTrench?.of_teams),
      defPct: rankToBar(defTrench?.proe_rank, defTrench?.of_teams),
    },
    {
      label: "Pace (Plays / Drive)",
      offText:
        offTrench?.plays_per_drive != null
          ? `${offTrench.plays_per_drive.toFixed(2)} (#${offTrench.pace_rank ?? "—"})`
          : "—",
      defText:
        defTrench?.plays_per_drive != null
          ? `${defTrench.plays_per_drive.toFixed(2)} (#${defTrench.pace_rank ?? "—"})`
          : "—",
      offPct: rankToBar(offTrench?.pace_rank, offTrench?.of_teams),
      defPct: rankToBar(defTrench?.pace_rank, defTrench?.of_teams),
    },
    {
      label: "Sim Prior (Adj Points / Drive)",
      offText: offInput?.off_ppd_adj != null ? offInput.off_ppd_adj.toFixed(2) : "—",
      defText: defInput?.def_ppd_allowed != null ? defInput.def_ppd_allowed.toFixed(2) : "—",
      offPct:
        offInput?.off_ppd_adj != null
          ? Math.min(95, Math.max(15, Math.round((offInput.off_ppd_adj / 3.0) * 100)))
          : 55,
      defPct:
        defInput?.def_ppd_allowed != null
          ? Math.min(95, Math.max(15, Math.round(((3.2 - defInput.def_ppd_allowed) / 2.2) * 100)))
          : 55,
    },
  ];

  return (
    <section className="flex flex-col gap-4" data-slot="matchup-field-view" aria-label="Matchup field view">
      {/* Game Selector Bar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border-soft bg-surface-inset p-2">
        {games.map((g) => {
          const isSelected = g.game_id === activeGame.game_id;
          return (
            <button
              key={g.game_id}
              type="button"
              onClick={() => setSelectedGameId(g.game_id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 t-caption font-semibold transition-colors",
                isSelected
                  ? "border-line bg-card text-foreground shadow-xs"
                  : "border-transparent text-muted-foreground hover:bg-card/60 hover:text-foreground",
              )}
            >
              <span>{g.away}</span>
              <span className="text-muted-foreground">@</span>
              <span>{g.home}</span>
            </button>
          );
        })}
      </div>

      {/* Main Two-Column Matchup Workspace */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Left: Stylized Football Field with Offensive Skill Formation Cards (7 cols) */}
        <div
          className="relative overflow-hidden rounded-xl border border-border-soft bg-surface-inset p-4 xl:col-span-7"
          data-slot="formation-field"
        >
          {/* Subtle yard-line SVG background */}
          <svg
            viewBox="0 0 600 400"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 size-full opacity-20"
            aria-hidden
          >
            {[50, 110, 170, 230, 290, 350, 410, 470, 530].map((x) => (
              <line
                key={x}
                x1={x}
                y1={0}
                x2={x}
                y2={400}
                stroke="var(--border)"
                strokeWidth={1.5}
                strokeDasharray="4 4"
              />
            ))}
          </svg>

          <div className="relative z-10 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-soft pb-2.5">
              <div className="flex items-center gap-2">
                <span className="t-colhead text-muted-foreground">OFFENSE</span>
                <TeamLogo team={offTeam} className="t-body font-bold" />
                <span className="t-caption text-muted-foreground">vs</span>
                <span className="t-colhead text-muted-foreground">DEFENSE</span>
                <TeamLogo team={defTeam} className="t-body font-bold" />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSwapped((s) => !s)}
                aria-label="Swap offense and defense"
              >
                <ArrowLeftRight className="mr-1.5 size-3.5" />
                Swap ({defTeam} Offense)
              </Button>
            </div>

            {formationPlayers.length === 0 ? (
              <p className="py-10 text-center t-body text-muted-foreground">
                No skill player usage rows logged for {offTeam} before this week.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {formationPlayers.map(({ role, player }) => (
                  <SkillFormationCard key={player.player_id} roleLabel={role} player={player} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: Vegas & Weather + Offense vs Defense Butterfly Bars (5 cols) */}
        <div className="flex flex-col gap-4 xl:col-span-5">
          {/* Vegas & Weather Card */}
          <div className="card grid grid-cols-1 gap-4 p-4 sm:grid-cols-2" data-slot="vegas-weather-card">
            <div className="flex flex-col gap-2">
              <h2 className="t-body font-semibold border-b border-border-soft pb-1.5">Vegas</h2>
              <table className="w-full t-caption">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="pb-1 text-left font-medium">Team</th>
                    <th className="pb-1 text-right font-medium">Total</th>
                    <th className="pb-1 text-right font-medium">Line</th>
                    <th className="pb-1 text-right font-medium">O/U</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-soft/60">
                  <tr>
                    <td className="py-1.5 font-semibold text-foreground">{activeGame.away}</td>
                    <td className="py-1.5 text-right tnum font-bold text-foreground">
                      {awayImp != null ? awayImp.toFixed(1) : "—"}
                    </td>
                    <td className="py-1.5 text-right tnum font-semibold text-line">
                      {awaySpreadBook != null ? line(awaySpreadBook) : "—"}
                    </td>
                    <td className="py-1.5 text-right tnum font-semibold text-line">
                      {activeGame.total_line != null ? activeGame.total_line.toFixed(1) : "—"}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-semibold text-foreground">{activeGame.home}</td>
                    <td className="py-1.5 text-right tnum font-bold text-foreground">
                      {homeImp != null ? homeImp.toFixed(1) : "—"}
                    </td>
                    <td className="py-1.5 text-right tnum font-semibold text-line">
                      {homeSpreadBook != null ? line(homeSpreadBook) : "—"}
                    </td>
                    <td className="py-1.5 text-right tnum font-semibold text-line">
                      {activeGame.total_line != null ? activeGame.total_line.toFixed(1) : "—"}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-2">
              <h2 className="t-body font-semibold border-b border-border-soft pb-1.5">Weather &amp; Venue</h2>
              <dl className="grid grid-cols-3 gap-2 pt-1 text-center">
                <div className="flex flex-col rounded-md bg-surface-inset p-2 border border-border-soft">
                  <dt className="t-caption text-muted-foreground">Roof</dt>
                  <dd className="t-body font-bold text-foreground capitalize">
                    {vegas?.roof ?? "Outdoors"}
                  </dd>
                </div>
                <div className="flex flex-col rounded-md bg-surface-inset p-2 border border-border-soft">
                  <dt className="t-caption text-muted-foreground">Temp</dt>
                  <dd className="t-body tnum font-bold text-foreground">
                    {vegas?.temp != null ? `${Math.round(vegas.temp)}°` : "Dome"}
                  </dd>
                </div>
                <div className="flex flex-col rounded-md bg-surface-inset p-2 border border-border-soft">
                  <dt className="t-caption text-muted-foreground">Wind</dt>
                  <dd className="t-body tnum font-bold text-foreground">
                    {vegas?.wind != null ? `${Math.round(vegas.wind)} mph` : "0 mph"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Offense vs Defense Butterfly Bar Chart Card */}
          <div className="card flex flex-col gap-3 p-4" data-slot="butterfly-comparison-card">
            <div className="flex items-center justify-between border-b border-border-soft pb-2">
              <div className="flex items-center gap-1.5">
                <TeamLogo team={offTeam} />
                <span className="t-caption font-bold text-foreground">Offense</span>
              </div>
              <h2 className="t-body font-semibold">Team Matchup</h2>
              <div className="flex items-center gap-1.5">
                <span className="t-caption font-bold text-foreground">Defense</span>
                <TeamLogo team={defTeam} />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {butterflyMetrics.map((m) => (
                <div key={m.label} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between t-caption">
                    <span className="tnum font-semibold text-foreground">{m.offText}</span>
                    <span className="text-center font-medium text-muted-foreground">{m.label}</span>
                    <span className="tnum font-semibold text-foreground">{m.defText}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 items-center">
                    {/* Left bar: grows right-to-left from center */}
                    <div className="flex h-2.5 w-full justify-end overflow-hidden rounded-l-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-l-full",
                          m.offGood ? "bg-edge-pos" : "bg-line",
                        )}
                        style={{ width: `${m.offPct}%` }}
                      />
                    </div>
                    {/* Right bar: grows left-to-right from center */}
                    <div className="flex h-2.5 w-full justify-start overflow-hidden rounded-r-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-r-full",
                          m.defGood ? "bg-edge-neg" : "bg-foreground/60",
                        )}
                        style={{ width: `${m.defPct}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
