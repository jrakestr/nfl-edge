"use client";

import Link from "next/link";
import { DistributionSpark } from "@/components/board/DistributionSpark";
import { PositionPill } from "@/components/ui/PositionPill";
import { StatusPill } from "@/components/ui/StatusPill";
import { TeamLogo } from "@/components/ui/TeamLogo";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { fallbackNotice } from "@/lib/slate";
import { MetricIcon, type Metric } from "@/lib/icons";
import { REBUILD_PENDING, inOptimizerPool, staleInjury } from "@/lib/injury-status";
import { actualDisplay } from "@/lib/player-actual";
import { positionRanks } from "@/lib/players/ranks";
import { GameStrip } from "@/components/shell/GameStrip";
import { useGamesSelection, useLiveSearchParams } from "@/components/shell/GamesSelection";
import { selectedOnSlate } from "@/lib/games-param";
import type { StripGame } from "@/lib/kickoff";
import { applyPicksToParams, emptyPicks, useSlatePicks, type PickKey } from "@/lib/slate-picks";
import { cn } from "@/lib/utils";
import type { WeekPlayer } from "@/lib/types";
import { useMemo, useState, useTransition, type ComponentProps, type ReactNode } from "react";
import { savePlayerDelta } from "@/lib/actions/player-points";
import { adjustedForMiss, editedPoints } from "@/lib/player-edit";
import { CURRENT_SEASON } from "@/lib/config";

type PlayersViewMode = "projections" | "statsuite";

function rowFlags(p: WeekPlayer) {
  const stale = staleInjury(p.override_status, p.override_updated_at, p.run_created_at);
  const inPool = inOptimizerPool(p.override_status, p.override_updated_at, p.run_created_at);
  return { stale, inPool };
}

function num(v: number | null | undefined, digits = 1): string {
  return v != null ? v.toFixed(digits) : "—";
}

function ownPct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${(v <= 1 ? v * 100 : v).toFixed(1)}%`;
}

function rankText(v: number | null | undefined): string {
  return v != null ? String(v) : "—";
}

const PRESSED: Partial<Record<Metric, string>> = {
  lock: "bg-edge-pos-tint text-edge-pos hover:bg-edge-pos-tint hover:text-edge-pos",
  exclude: "bg-edge-neg-tint text-edge-neg hover:bg-edge-neg-tint hover:text-edge-neg",
  stack: "bg-line-tint text-line hover:bg-line-tint hover:text-line",
};

export const PLAYER_CELL =
  "sticky left-0 z-10 bg-card border-r border-border-soft px-1! [[data-locked]_&]:shadow-[inset_3px_0_0_0_var(--edge-pos)]";
const PLAYER_HEAD = "sticky left-0 z-20 bg-muted border-r border-border-soft px-1!";
const TIGHT = "px-1!";

function PickButton({
  metric,
  label,
  pressed,
  disabled,
  onClick,
}: {
  metric: Metric;
  label: string;
  pressed: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      className={cn(pressed && PRESSED[metric], pressed && "[&_svg]:stroke-2")}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <MetricIcon metric={metric} />
    </Button>
  );
}

function tone(excluded: boolean, extra?: string) {
  return cn("tnum font-semibold", excluded ? "text-muted-foreground" : "text-foreground", extra);
}

function PointStepper({
  name,
  base,
  delta,
  season,
  week,
  site,
  slate,
  playerId,
  excluded,
}: {
  name: string;
  base: number | null;
  delta: number;
  season: number;
  week: number;
  site: string;
  slate: string;
  playerId: string;
  excluded?: boolean;
}) {
  const [step, setStep] = useState(delta);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (base == null) {
    return <span className={tone(Boolean(excluded))}>—</span>;
  }

  const edited = editedPoints(base, step);

  function move(next: number) {
    setError(null);
    setStep(next);
    start(async () => {
      const res = await savePlayerDelta({ season, week, site, slate, playerId, delta: next });
      if (!res.ok) {
        setStep(delta);
        setError(res.error);
      }
    });
  }

  return (
    <span className="inline-flex items-center justify-end gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        aria-label={`Decrease points for ${name}`}
        disabled={pending}
        onClick={() => move(step - 1)}
      >
        −
      </Button>
      <span className={tone(Boolean(excluded))}>{num(edited)}</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2"
        aria-label={`Increase points for ${name}`}
        disabled={pending}
        onClick={() => move(step + 1)}
      >
        +
      </Button>
      {error ? <span className="t-caption text-warn">{error}</span> : null}
    </span>
  );
}

/** Slate player library. Rows from raw.dk_salaries ⨝ proj_players for this slate. */
export function PlayersList({
  players = [],
  slateId = "",
  week = 1,
  season = CURRENT_SEASON,
  site = "dk",
  slate = "main",
  toolbar,
  fallbackFrom,
  strip = [],
}: {
  players?: WeekPlayer[];
  slateId?: string;
  week?: number | string;
  season?: number;
  site?: string;
  slate?: string;
  toolbar?: ReactNode;
  fallbackFrom?: string | null;
  strip?: StripGame[];
}) {
  const weekN = typeof week === "number" ? week : Number(week);
  const [mode, setMode] = useState<PlayersViewMode>("projections");
  const { picks, toggle, setPicks } = useSlatePicks(slateId);
  const live = useLiveSearchParams();
  const { selected } = useGamesSelection();
  const buildQs = applyPicksToParams(picks, new URLSearchParams(live.toString())).toString();
  const buildHref = `/week/${week}/optimize/${site}/${slate}${buildQs ? `?${buildQs}` : ""}`;
  const visible = useMemo(() => {
    const active = selectedOnSlate(selected, strip.map((g) => g.game_id));
    if (!active.length) return players;
    const set = new Set(active);
    return players.filter((p) => p.game_id != null && set.has(p.game_id));
  }, [players, selected, strip]);
  const ranks = useMemo(() => {
    const proj = positionRanks(players, (p) => p.position, (p) => p.fpts_dk_mean);
    const m = new Map<string, { proj: number | null }>();
    players.forEach((p, i) => {
      m.set(p.player_dk_id ?? p.player_id, {
        proj: proj[i] ?? null,
      });
    });
    return m;
  }, [players]);

  /** Actual and Diff exist only once the week has graded rows. */
  const hasActuals = useMemo(() => players.some((p) => p.actual_state != null), [players]);

  const actualColumns: DataColumn<WeekPlayer>[] = hasActuals
    ? [
        {
          id: "actual",
          header: "Actual",
          group: "PROJECTIONS",
          align: "right",
          sortValue: (p) => (p.actual_state === "played" ? p.actual_dk : null),
          cell: (p) => (
            <span className={tone(Boolean(p.player_dk_id && picks.excl.includes(p.player_dk_id)))}>
              {actualDisplay(p).actual}
            </span>
          ),
        },
        {
          id: "diff",
          header: "Diff",
          group: "PROJECTIONS",
          align: "right",
          sortValue: (p) => actualDisplay(p).diffValue,
          cell: (p) => {
            const { diff, diffValue } = actualDisplay(p);
            return (
              <span
                className={cn(
                  "tnum font-semibold",
                  diffValue == null
                    ? "text-muted-foreground"
                    : diffValue > 0
                      ? "text-edge-pos"
                      : diffValue < 0
                        ? "text-edge-neg"
                        : "text-foreground",
                )}
              >
                {diff}
              </span>
            );
          },
        },
      ]
    : [];

  const statSuiteColumns: DataColumn<WeekPlayer>[] =
    mode === "statsuite"
      ? [
          {
            id: "floor",
            header: "Floor (P10)",
            group: "STATSUITE+ RANGE",
            align: "right",
            sortValue: (p) => p.floor,
            cell: (p) => (
              <span className={tone(Boolean(p.player_dk_id && picks.excl.includes(p.player_dk_id)))}>
                {num(p.floor)}
              </span>
            ),
          },
          {
            id: "sd",
            header: "Volatility (SD)",
            group: "STATSUITE+ RANGE",
            align: "right",
            sortValue: (p) => p.fpts_dk_sd,
            cell: (p) => (
              <span className={tone(Boolean(p.player_dk_id && picks.excl.includes(p.player_dk_id)))}>
                {num(p.fpts_dk_sd)}
              </span>
            ),
          },
          {
            id: "spark",
            header: "Sim dist",
            group: "STATSUITE+ RANGE",
            sortable: false,
            cell: (p) => (
              <DistributionSpark
                counts={p.hist?.counts ?? null}
                bins={p.hist?.bins ?? null}
                marker={p.typical_dk}
              />
            ),
          },
          {
            id: "envTotal",
            header: "Game total",
            group: "ENVIRONMENT",
            align: "right",
            sortValue: (p) => p.market_total,
            cell: (p) => (
              <span className="tnum font-semibold text-line">
                {p.market_total != null ? p.market_total.toFixed(1) : "—"}
              </span>
            ),
          },
        ]
      : [];

  function pickAction(key: PickKey, p: WeekPlayer) {
    const id = p.player_dk_id;
    if (!id) return;
    toggle(key, id);
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="t-title">Players</h1>
          <ToggleGroup
            type="single"
            value={mode}
            onValueChange={(v) => v && setMode(v as PlayersViewMode)}
            size="sm"
            spacing={0}
            aria-label="Players view mode"
          >
            <ToggleGroupItem value="projections" className="t-caption h-8 px-3">
              Projections
            </ToggleGroupItem>
            <ToggleGroupItem value="statsuite" className="t-caption h-8 px-3">
              StatSuite+ Range
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        {toolbar}
        <p className="t-caption text-muted-foreground">
          Plus and minus change your copy by one point. Adjusted is the sim plus his average miss from earlier weeks.
        </p>
        {fallbackFrom ? <p className="t-caption text-warn">{fallbackNotice(fallbackFrom)}</p> : null}
      </header>
      {strip.length ? <GameStrip games={strip} /> : null}
      <DataTable
        data={visible}
        getRowId={(p) => p.player_dk_id ?? p.player_id}
        empty="No projections listed yet"
        ariaLabel="Players"
        rowProps={(p) => {
          const id = p.player_dk_id;
          const locked = id != null && picks.lock.includes(id);
          const excluded = id != null && picks.excl.includes(id);
          const stacked = id != null && picks.stack.includes(id);
          return {
            "data-in-pool": String(rowFlags(p).inPool),
            "data-locked": locked ? "true" : undefined,
            "data-excluded": excluded ? "true" : undefined,
            "data-stacked": stacked ? "true" : undefined,
            className: excluded ? "opacity-60" : undefined,
          } as ComponentProps<"tr">;
        }}
        searchPlaceholder="Name or team"
        filters={{
          search: (p, q) =>
            p.display_name.toLowerCase().includes(q) ||
            (p.team ?? "").toLowerCase().includes(q) ||
            (p.position ?? "").toLowerCase().includes(q) ||
            (p.player_dk_id ?? "").includes(q),
          position: (p) => p.position,
          team: (p) => p.team,
          minProj: (p) => p.fpts_dk_mean,
          hideUnproj: (p) => p.fpts_dk_mean,
          salary: (p) => p.salary,
        }}
        columns={[
          {
            id: "player",
            header: "Player",
            className: PLAYER_CELL,
            headClassName: PLAYER_HEAD,
            sortValue: (p) => p.display_name,
            cell: (p) => {
              const id = p.player_dk_id;
              const locked = id != null && picks.lock.includes(id);
              const excluded = id != null && picks.excl.includes(id);
              const stacked = id != null && picks.stack.includes(id);
              return (
                <span className="inline-flex items-center gap-1.5">
                  <PositionPill position={p.position} />
                  <Link
                    href={`/players/${p.game_id ?? "unknown"}/${p.player_id}`}
                    className={cn(
                      "font-semibold underline-offset-2 hover:underline",
                      excluded ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {p.display_name}
                  </Link>
                  {locked ? (
                    <span className="t-caption font-semibold text-foreground">Lock</span>
                  ) : null}
                  {stacked && p.team ? (
                    <span className="t-caption font-semibold text-foreground">{p.team}</span>
                  ) : null}
                </span>
              );
            },
          },
          {
            id: "team",
            header: "Team",
            className: TIGHT,
            headClassName: TIGHT,
            sortValue: (p) => p.team ?? "",
            cell: (p) => (
              <TeamLogo
                team={p.team ?? ""}
                className={cn(
                  "t-body",
                  p.player_dk_id && picks.excl.includes(p.player_dk_id)
                    ? "text-muted-foreground"
                    : "text-foreground",
                )}
              />
            ),
          },
          {
            id: "opp",
            header: "Opp",
            className: TIGHT,
            headClassName: TIGHT,
            sortValue: (p) => p.opponent ?? "",
            cell: (p) => (
              <span
                className={cn(
                  "t-body font-semibold",
                  p.player_dk_id && picks.excl.includes(p.player_dk_id)
                    ? "text-muted-foreground"
                    : "text-foreground",
                )}
              >
                {p.opponent ?? "—"}
              </span>
            ),
          },
          {
            id: "kickoff",
            header: "Kickoff",
            className: TIGHT,
            headClassName: TIGHT,
            sortValue: (p) => p.kickoff ?? "",
            cell: (p) => <span className="t-caption">{p.kickoff ?? "—"}</span>,
          },
          {
            id: "salary",
            header: "Salary",
            group: "DFS SLATE",
            metric: "salary",
            align: "right",
            sortValue: (p) => p.salary,
            cell: (p) => (
              <span className={tone(Boolean(p.player_dk_id && picks.excl.includes(p.player_dk_id)))}>
                {p.salary != null ? p.salary.toLocaleString("en-US") : "—"}
              </span>
            ),
          },
          {
            id: "proj",
            header: "DK pts",
            group: "PROJECTIONS",
            metric: "projection",
            align: "right",
            sortValue: (p) => p.fpts_dk_mean,
            cell: (p) => {
              const { stale } = rowFlags(p);
              const excluded = Boolean(p.player_dk_id && picks.excl.includes(p.player_dk_id));
              return (
                <span className="flex flex-col items-end gap-0.5">
                  <span className={tone(excluded || stale)}>{num(p.fpts_dk_mean)}</span>
                  {stale ? (
                    <span className="max-w-44 text-right leading-tight whitespace-normal t-caption text-warn">
                      {REBUILD_PENDING}
                    </span>
                  ) : null}
                </span>
              );
            },
          },
          ...actualColumns,
          {
            id: "ngs",
            header: "NFLGameSim",
            group: "PROJECTIONS",
            align: "right",
            sortValue: (p) => p.ngs_fpts,
            cell: (p) => (
              <span className="t-caption text-muted-foreground">{num(p.ngs_fpts)}</span>
            ),
          },
          {
            id: "fp",
            header: "FantasyPros",
            group: "PROJECTIONS",
            align: "right",
            sortValue: (p) => p.fp_fpts,
            cell: (p) => (
              <span className="t-caption text-muted-foreground">{num(p.fp_fpts)}</span>
            ),
          },
          {
            id: "adj",
            header: "Adjusted",
            group: "PROJECTIONS",
            align: "right",
            sortValue: (p) => adjustedForMiss(p.fpts_dk_mean, p.mean_miss),
            cell: (p) => (
              <span className={tone(Boolean(p.player_dk_id && picks.excl.includes(p.player_dk_id)))}>
                {num(adjustedForMiss(p.fpts_dk_mean, p.mean_miss))}
              </span>
            ),
          },
          {
            id: "yours",
            header: "Yours",
            group: "PROJECTIONS",
            align: "right",
            sortValue: (p) =>
              editedPoints(adjustedForMiss(p.fpts_dk_mean, p.mean_miss), p.point_delta ?? 0),
            cell: (p) => (
              <PointStepper
                name={p.display_name}
                base={adjustedForMiss(p.fpts_dk_mean, p.mean_miss)}
                delta={p.point_delta ?? 0}
                season={season}
                week={weekN}
                site={site}
                slate={slate}
                playerId={p.player_id}
                excluded={Boolean(p.player_dk_id && picks.excl.includes(p.player_dk_id))}
              />
            ),
          },
          {
            id: "projRk",
            header: "Pts rk",
            group: "PROJECTIONS",
            align: "right",
            sortValue: (p) => ranks.get(p.player_dk_id ?? p.player_id)?.proj,
            cell: (p) => (
              <span className={tone(Boolean(p.player_dk_id && picks.excl.includes(p.player_dk_id)))}>
                {rankText(ranks.get(p.player_dk_id ?? p.player_id)?.proj)}
              </span>
            ),
          },
          {
            id: "ceiling",
            header: "Ceiling",
            group: "VALUE & OWNERSHIP",
            align: "right",
            sortValue: (p) => p.ceiling,
            cell: (p) => (
              <span className={tone(Boolean(p.player_dk_id && picks.excl.includes(p.player_dk_id)))}>
                {num(p.ceiling)}
              </span>
            ),
          },
          ...statSuiteColumns,
          {
            id: "own",
            header: "Own",
            group: "VALUE & OWNERSHIP",
            metric: "ownership",
            align: "right",
            sortValue: (p) => p.proj_own,
            cell: (p) => (
              <span className={tone(Boolean(p.player_dk_id && picks.excl.includes(p.player_dk_id)))}>
                {ownPct(p.proj_own)}
              </span>
            ),
          },
          {
            id: "value",
            header: "Value",
            group: "VALUE & OWNERSHIP",
            metric: "value",
            align: "right",
            sortValue: (p) => p.value,
            cell: (p) => {
              const excluded = Boolean(p.player_dk_id && picks.excl.includes(p.player_dk_id));
              return (
                <span className={tone(excluded)}>
                  {num(p.value, 2)}
                </span>
              );
            },
          },
          {
            id: "injury",
            header: "Injury",
            sortValue: (p) => p.override_status ?? "",
            cell: (p) => <StatusPill status={p.override_status} />,
          },
          {
            id: "typical",
            header: "Typical game",
            align: "right",
            sortValue: (p) => p.typical_dk,
            cell: (p) => (
              <span className={tone(Boolean(p.player_dk_id && picks.excl.includes(p.player_dk_id)))}>
                {num(p.typical_dk)}
              </span>
            ),
          },
          {
            id: "actions",
            header: "Picks",
            sortable: false,
            cell: (p) => {
              const id = p.player_dk_id;
              const disabled = !id;
              return (
                <span className="inline-flex items-center gap-0.5">
                  <PickButton
                    metric="lock"
                    label={`Lock ${p.display_name}`}
                    pressed={id != null && picks.lock.includes(id)}
                    disabled={disabled}
                    onClick={() => pickAction("lock", p)}
                  />
                  <PickButton
                    metric="exclude"
                    label={`Exclude ${p.display_name}`}
                    pressed={id != null && picks.excl.includes(id)}
                    disabled={disabled}
                    onClick={() => pickAction("excl", p)}
                  />
                  <PickButton
                    metric="stack"
                    label={`Add ${p.display_name} to stack`}
                    pressed={id != null && picks.stack.includes(id)}
                    disabled={disabled}
                    onClick={() => pickAction("stack", p)}
                  />
                </span>
              );
            },
          },
        ]}
      />
      <aside
        className="glass sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
        aria-label="Pick summary"
      >
        <p className="t-body font-semibold text-foreground">
          Locked {picks.lock.length} · Excluded {picks.excl.length} · Stacked {picks.stack.length}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setPicks(emptyPicks())}>
            Clear picks
          </Button>
          <Button asChild size="sm">
            <Link href={buildHref}>Build lineups with these →</Link>
          </Button>
        </div>
      </aside>
    </div>
  );
}
