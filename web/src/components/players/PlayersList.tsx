"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { PositionPill } from "@/components/ui/PositionPill";
import { DataTable } from "@/components/ui/DataTable";
import { Button } from "@/components/ui/button";
import { TeamDot } from "@/components/board/TeamDot";
import { MetricIcon } from "@/lib/icons";
import { gameKey } from "@/lib/optimize/game-info";
import { ownPctV1, ranks, valuePerK } from "@/lib/optimize/own";
import { applyExclude, applyLock, applyStack, usePoolState } from "@/lib/pool-state";
import type { SlatePlayer } from "@/lib/types";
import { cn } from "@/lib/utils";

type Row = SlatePlayer & { own: number; value: number | null; game: string };

function PoolButton({
  label,
  pressed,
  onClick,
  metric,
}: {
  label: string;
  pressed: boolean;
  onClick: () => void;
  metric: "lock" | "exclude" | "stack";
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex h-7 w-7 items-center justify-center rounded-md border",
        pressed ? "border-foreground bg-accent text-foreground" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <MetricIcon metric={metric} />
    </button>
  );
}

export function PlayerLibrary(props: {
  week?: string;
  site?: string;
  slate?: string;
  players?: SlatePlayer[];
}) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <header>
            <h1 className="t-title">Players</h1>
          </header>
          <p className="t-caption">No players on this slate yet</p>
        </div>
      }
    >
      <PlayerLibraryInner {...props} />
    </Suspense>
  );
}

function PlayerLibraryInner({
  week = "1",
  site = "dk",
  slate = "main",
  players = [],
}: {
  week?: string;
  site?: string;
  slate?: string;
  players?: SlatePlayer[];
}) {
  const [pool, setPool] = usePoolState();
  const siteKey = site === "fd" ? "fd" : "dk";
  const slateKey = ["main", "full", "showdown"].includes(slate) ? slate : "main";

  const rows: Row[] = useMemo(() => {
    const sal = ranks(players.map((p) => p.salary ?? 0));
    const proj = ranks(players.map((p) => p.fpts_dk_mean ?? 0));
    return players.map((p, i) => ({
      ...p,
      own: ownPctV1(sal[i]!, proj[i]!, players.length),
      value: valuePerK(p.fpts_dk_mean, p.salary),
      game: gameKey(p.game_info),
    }));
  }, [players]);

  const nameOf = (id: string) => players.find((p) => p.player_id === id)?.display_name ?? id;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="t-title">Players</h1>
          <Button asChild size="sm">
            <Link href={`/week/${week}/optimize/${siteKey}/${slateKey}`}>Optimize</Link>
          </Button>
        </div>
        <nav className="flex h-8 items-center gap-1" aria-label="Slate">
          {(
            [
              ["main", "Main"],
              ["full", "Full"],
              ["showdown", "Showdown"],
            ] as const
          ).map(([id, label]) => (
            <Link
              key={id}
              href={`/week/${week}/players/${siteKey}/${id}`}
              aria-current={slateKey === id ? "page" : undefined}
              className={cn("px-2 t-body", slateKey === id ? "text-foreground font-semibold" : "text-muted-foreground")}
            >
              {label}
            </Link>
          ))}
        </nav>
        <p className="t-caption">
          Locked {pool.locked.length ? pool.locked.map(nameOf).join(", ") : "—"}
          {" · "}
          Excluded {pool.excluded.length ? pool.excluded.map(nameOf).join(", ") : "—"}
          {pool.qbStackTeam ? ` · ${pool.qbStackTeam} stack` : ""}
          {pool.bringBackTeam ? ` + ${pool.bringBackTeam} bring-back` : ""}
        </p>
      </header>
      <DataTable
        data={rows}
        getRowId={(p) => p.player_id}
        empty="No players on this slate yet"
        ariaLabel="Player library"
        searchPlaceholder="Name or team"
        defaultSort={{ id: "proj", dir: "desc" }}
        filters={{
          search: (p, q) =>
            p.display_name.toLowerCase().includes(q) ||
            (p.team ?? "").toLowerCase().includes(q) ||
            (p.position ?? "").toLowerCase().includes(q),
          position: (p) => p.position,
          team: (p) => p.team,
          game: (p) => p.game,
          salary: (p) => p.salary,
          minProj: (p) => p.fpts_dk_mean,
        }}
        columns={[
          {
            id: "actions",
            header: "Pool",
            sortable: false,
            cell: (p) => (
              <span className="inline-flex items-center gap-1">
                <PoolButton
                  label={`Lock ${p.display_name}`}
                  metric="lock"
                  pressed={pool.locked.includes(p.player_id)}
                  onClick={() => setPool((s) => applyLock(s, p.player_id))}
                />
                <PoolButton
                  label={`Exclude ${p.display_name}`}
                  metric="exclude"
                  pressed={pool.excluded.includes(p.player_id)}
                  onClick={() => setPool((s) => applyExclude(s, p.player_id))}
                />
                <PoolButton
                  label={`Add ${p.display_name} to stack`}
                  metric="stack"
                  pressed={pool.stacked.includes(p.player_id)}
                  onClick={() => setPool((s) => applyStack(s, p.player_id, p.team, p.position))}
                />
              </span>
            ),
          },
          {
            id: "player",
            header: "Player",
            sortValue: (p) => p.display_name,
            cell: (p) => (
              <span className="inline-flex items-center gap-1.5">
                <PositionPill position={p.position} />
                {p.game_id ? (
                  <Link
                    href={`/props/${p.game_id}/${p.player_id}`}
                    className="font-semibold text-foreground underline-offset-2 hover:underline"
                  >
                    {p.display_name}
                  </Link>
                ) : (
                  <span className="font-semibold text-foreground">{p.display_name}</span>
                )}
              </span>
            ),
          },
          {
            id: "team",
            header: "Team",
            sortValue: (p) => p.team ?? "",
            cell: (p) => (p.team ? <TeamDot abbr={p.team} /> : <span className="t-body font-semibold">—</span>),
          },
          {
            id: "game",
            header: "Game",
            sortValue: (p) => p.game,
            cell: (p) => <span className="t-body font-semibold text-foreground">{p.game || "—"}</span>,
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
            cell: (p) => (
              <span className="tnum font-semibold text-foreground">
                {p.fpts_dk_mean != null ? p.fpts_dk_mean.toFixed(1) : "—"}
              </span>
            ),
          },
          {
            id: "value",
            header: "Value",
            metric: "value",
            align: "right",
            sortValue: (p) => p.value,
            cell: (p) => (
              <span className="tnum font-semibold text-foreground">{p.value != null ? p.value.toFixed(2) : "—"}</span>
            ),
          },
          {
            id: "own",
            header: "Own %",
            metric: "ownership",
            align: "right",
            sortValue: (p) => p.own,
            cell: (p) => <span className="tnum font-semibold text-foreground">{p.own.toFixed(1)}</span>,
          },
        ]}
      />
    </div>
  );
}

export { PlayerLibrary as PlayersList };
