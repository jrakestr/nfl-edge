"use client";

import Link from "next/link";
import { PositionPill } from "@/components/ui/PositionPill";
import { StatusPill } from "@/components/ui/StatusPill";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/DataTable";
import { fallbackNotice } from "@/lib/slate";
import { MetricIcon, type Metric } from "@/lib/icons";
import { REBUILD_PENDING, inOptimizerPool, staleInjury } from "@/lib/injury-status";
import { useSlatePicks, type PickKey } from "@/lib/slate-picks";
import { cn } from "@/lib/utils";
import type { WeekPlayer } from "@/lib/types";
import type { ComponentProps, ReactNode } from "react";

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
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      <MetricIcon metric={metric} />
    </Button>
  );
}

/** Slate player library. Rows from raw.dk_salaries ⨝ proj_players for this slate. */
export function PlayersList({
  players = [],
  slateId = "",
  toolbar,
  fallbackFrom,
}: {
  players?: WeekPlayer[];
  slateId?: string;
  toolbar?: ReactNode;
  fallbackFrom?: string | null;
}) {
  const { picks, toggle } = useSlatePicks(slateId);

  function pickAction(key: PickKey, p: WeekPlayer) {
    const id = p.player_dk_id;
    if (!id) return;
    toggle(key, id);
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <h1 className="t-title">Players</h1>
        {toolbar}
        {fallbackFrom ? <p className="t-caption text-warn">{fallbackNotice(fallbackFrom)}</p> : null}
      </header>
      <DataTable
        data={players}
        getRowId={(p) => p.player_dk_id ?? p.player_id}
        empty="No projections listed yet"
        ariaLabel="Players"
        rowProps={(p) =>
          ({ "data-in-pool": String(rowFlags(p).inPool) }) as ComponentProps<"tr">
        }
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
          salary: (p) => p.salary,
        }}
        columns={[
          {
            id: "player",
            header: "Player",
            sortValue: (p) => p.display_name,
            cell: (p) => (
              <span className="inline-flex items-center gap-1.5">
                <PositionPill position={p.position} />
                <Link
                  href={`/props/${p.game_id ?? "unknown"}/${p.player_id}`}
                  className="font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  {p.display_name}
                </Link>
              </span>
            ),
          },
          {
            id: "team",
            header: "Team",
            sortValue: (p) => p.team ?? "",
            cell: (p) => <span className="t-body font-semibold text-foreground">{p.team ?? "—"}</span>,
          },
          {
            id: "opp",
            header: "Opp",
            sortValue: (p) => p.opponent ?? "",
            cell: (p) => <span className="t-body font-semibold text-foreground">{p.opponent ?? "—"}</span>,
          },
          {
            id: "kickoff",
            header: "Kickoff",
            sortValue: (p) => p.kickoff ?? "",
            cell: (p) => <span className="t-caption">{p.kickoff ?? "—"}</span>,
          },
          {
            id: "dkid",
            header: "DK ID",
            sortValue: (p) => p.player_dk_id ?? "",
            cell: (p) => <span className="tnum font-semibold text-foreground">{p.player_dk_id ?? "—"}</span>,
          },
          {
            id: "salary",
            header: "Salary",
            metric: "salary",
            align: "right",
            sortValue: (p) => p.salary,
            cell: (p) => (
              <span className="tnum font-semibold text-foreground">
                {p.salary != null ? p.salary.toLocaleString("en-US") : "—"}
              </span>
            ),
          },
          {
            id: "proj",
            header: "DK pts",
            metric: "projection",
            align: "right",
            sortValue: (p) => p.fpts_dk_mean,
            cell: (p) => {
              const { stale } = rowFlags(p);
              return (
                <span className="flex flex-col items-end gap-0.5">
                  <span
                    className={cn(
                      "tnum font-semibold",
                      stale ? "text-muted-foreground" : "text-foreground",
                    )}
                  >
                    {num(p.fpts_dk_mean)}
                  </span>
                  {stale ? <span className="t-caption text-warn">{REBUILD_PENDING}</span> : null}
                </span>
              );
            },
          },
          {
            id: "floor",
            header: "Floor / ceil",
            align: "right",
            sortValue: (p) => p.ceiling,
            cell: (p) => (
              <span className="tnum font-semibold text-foreground">
                {p.floor == null && p.ceiling == null ? "—" : `${num(p.floor)}–${num(p.ceiling)}`}
              </span>
            ),
          },
          {
            id: "own",
            header: "Own",
            metric: "ownership",
            align: "right",
            sortValue: (p) => p.proj_own,
            cell: (p) => <span className="tnum font-semibold text-foreground">{ownPct(p.proj_own)}</span>,
          },
          {
            id: "value",
            header: "Value",
            metric: "value",
            align: "right",
            sortValue: (p) => p.value,
            cell: (p) => <span className="tnum font-semibold text-foreground">{num(p.value, 2)}</span>,
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
            cell: (p) => <span className="tnum font-semibold text-foreground">{num(p.typical_dk)}</span>,
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
    </div>
  );
}
