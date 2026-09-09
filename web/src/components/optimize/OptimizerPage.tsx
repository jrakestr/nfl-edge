"use client";

import Link from "next/link";
import { Suspense, useMemo, useState } from "react";
import { LineupCard } from "@/components/dfs/LineupCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatUploadCsv } from "@/lib/dfs-upload";
import { MetricLabel } from "@/lib/icons";
import { optimizeFromPool } from "@/lib/optimize/classic";
import { usePoolState } from "@/lib/pool-state";
import type { DfsLineup, SlatePlayer } from "@/lib/types";
import { cn } from "@/lib/utils";

function downloadCsv(name: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function OptimizerPage(props: {
  week: string;
  site: string;
  slate: string;
  runId?: string | null;
  slateId?: string;
  players?: SlatePlayer[];
  simLineups?: DfsLineup[];
  teams?: Record<string, string>;
  positions?: Record<string, string>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <header>
            <h1 className="t-title">Optimize</h1>
          </header>
          <p className="t-caption">Lineups generate here once the slate loads.</p>
        </div>
      }
    >
      <OptimizerInner {...props} />
    </Suspense>
  );
}

function OptimizerInner({
  week,
  site,
  slate,
  runId = null,
  slateId = "",
  players = [],
  simLineups = [],
  teams = {},
  positions = {},
}: {
  week: string;
  site: string;
  slate: string;
  runId?: string | null;
  slateId?: string;
  players?: SlatePlayer[];
  simLineups?: DfsLineup[];
  teams?: Record<string, string>;
  positions?: Record<string, string>;
}) {
  const [pool, setPool] = usePoolState();
  const [tab, setTab] = useState<"build" | "sim">(pool.tab);
  const [built, setBuilt] = useState<DfsLineup[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const siteKey = site === "fd" ? "fd" : "dk";
  const slateKey = ["main", "full", "showdown"].includes(slate) ? slate : "main";

  const teamOptions = useMemo(() => {
    return [...new Set(players.map((p) => p.team).filter((t): t is string => !!t))].sort();
  }, [players]);

  const salaryTeams = useMemo(() => {
    const out: Record<string, string> = { ...teams };
    for (const p of players) {
      if (p.team) out[p.display_name.toLowerCase()] = p.team;
    }
    return out;
  }, [players, teams]);

  const salaryPositions = useMemo(() => {
    const out: Record<string, string> = { ...positions };
    for (const p of players) {
      if (p.position) out[p.display_name.toLowerCase()] = p.position;
    }
    return out;
  }, [players, positions]);

  function generate() {
    const result = optimizeFromPool(players, pool, 7);
    setBuilt(result.lineups);
    setError(result.error);
    setSelected(new Set(result.lineups.map((l) => l.lineup_id)));
  }

  function startFrom(lu: DfsLineup) {
    const ids: string[] = [];
    for (const p of lu.players) {
      const row = players.find(
        (s) => (p.dk_id && s.dk_id === p.dk_id) || s.display_name.toLowerCase() === p.name.toLowerCase(),
      );
      if (row) ids.push(row.player_id);
    }
    setTab("build");
    setPool((s) => ({
      ...s,
      locked: ids,
      excluded: s.excluded.filter((id) => !ids.includes(id)),
      tab: "build",
    }));
  }

  function onExport() {
    if (!runId || selected.size === 0) return;
    const picked = built.filter((l) => selected.has(l.lineup_id));
    downloadCsv(`dk_upload_${slateId || "build"}.csv`, formatUploadCsv(runId, slateId, picked));
  }

  function switchTab(next: "build" | "sim") {
    setTab(next);
    setPool({ tab: next });
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="t-title">Optimize</h1>
          <Button asChild size="sm" variant="outline">
            <Link href={`/week/${week}/players/${siteKey}/${slateKey}`}>Player library</Link>
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
              href={`/week/${week}/optimize/${siteKey}/${id}`}
              aria-current={slateKey === id ? "page" : undefined}
              className={cn("px-2 t-body", slateKey === id ? "text-foreground font-semibold" : "text-muted-foreground")}
            >
              {label}
            </Link>
          ))}
        </nav>
      </header>

      <div>
        <div
          role="tablist"
          aria-label="Optimizer views"
          className="mb-4 inline-flex gap-1 rounded-xl border border-border bg-muted p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tab === "build"}
            className={
              tab === "build"
                ? "rounded-lg bg-card px-3 py-1.5 text-sm font-medium text-foreground"
                : "rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground"
            }
            onClick={() => switchTab("build")}
          >
            Build
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "sim"}
            className={
              tab === "sim"
                ? "rounded-lg bg-card px-3 py-1.5 text-sm font-medium text-foreground"
                : "rounded-lg px-3 py-1.5 text-sm font-medium text-muted-foreground"
            }
            onClick={() => switchTab("sim")}
          >
            Sim 150
          </button>
        </div>

        {tab === "build" ? (
          <div className="flex flex-col gap-4">
            <section className="card flex flex-col gap-3 p-4" aria-label="Build settings">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-1">
                  <span className="t-colhead text-muted-foreground">QB stack</span>
                  <select
                    aria-label="QB stack team"
                    className="h-8 rounded-md border border-border bg-card px-2 t-body"
                    value={pool.qbStackTeam}
                    onChange={(e) => setPool({ qbStackTeam: e.target.value })}
                  >
                    <option value="">Any</option>
                    {teamOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="t-colhead text-muted-foreground">Bring-back</span>
                  <select
                    aria-label="Bring-back team"
                    className="h-8 rounded-md border border-border bg-card px-2 t-body"
                    value={pool.bringBackTeam}
                    onChange={(e) => setPool({ bringBackTeam: e.target.value })}
                  >
                    <option value="">Opponent</option>
                    {teamOptions.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex w-24 flex-col gap-1">
                  <span className="t-colhead text-muted-foreground">Lineups</span>
                  <Input
                    inputMode="numeric"
                    aria-label="Number of lineups"
                    value={String(pool.nLineups)}
                    onChange={(e) => setPool({ nLineups: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </label>
                <label className="flex w-28 flex-col gap-1">
                  <span className="t-colhead text-muted-foreground">
                    <MetricLabel metric="leverage">Randomness</MetricLabel>
                  </span>
                  <Input
                    inputMode="numeric"
                    aria-label="Randomness"
                    value={String(pool.randomness)}
                    onChange={(e) => setPool({ randomness: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </label>
                <label className="flex w-32 flex-col gap-1">
                  <span className="t-colhead text-muted-foreground">Max exposure %</span>
                  <Input
                    inputMode="numeric"
                    aria-label="Max exposure"
                    value={String(Math.round(pool.maxExposure * 100))}
                    onChange={(e) =>
                      setPool({ maxExposure: Math.min(1, Math.max(0.05, (Number(e.target.value) || 40) / 100)) })
                    }
                  />
                </label>
                <Button type="button" size="sm" onClick={generate} disabled={players.length === 0}>
                  Generate
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={!runId || selected.size === 0} onClick={onExport}>
                  Export
                </Button>
              </div>
              <p className="t-caption">
                Locked {pool.locked.length} · Excluded {pool.excluded.length} · Stacked {pool.stacked.length}
                {pool.qbStackTeam ? ` · ${pool.qbStackTeam} QB stack` : ""}
                {pool.bringBackTeam ? ` with ${pool.bringBackTeam} bring-back` : ""}
              </p>
              {error ? <p className="t-caption text-warn">{error}</p> : null}
            </section>
            <section className="flex flex-col gap-3" aria-label="Built lineups">
              {built.length === 0 ? (
                <p className="t-caption">Generate lineups around the locks. Stack rules, exposure, and randomness apply here.</p>
              ) : (
                built.map((lu) => (
                  <LineupCard
                    key={lu.lineup_id}
                    slate={slateKey}
                    lineup={lu}
                    teams={salaryTeams}
                    positions={salaryPositions}
                    selected={selected.has(lu.lineup_id)}
                    onToggle={() =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(lu.lineup_id)) next.delete(lu.lineup_id);
                        else next.add(lu.lineup_id);
                        return next;
                      })
                    }
                  />
                ))
              )}
            </section>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="t-caption">Weekly sim lineups. Start from one to lock that nine and rebuild around it.</p>
            {simLineups.length === 0 ? (
              <p className="t-caption">No sim lineups for this slate yet.</p>
            ) : (
              simLineups.map((lu) => (
                <div key={lu.lineup_id} className="flex flex-col gap-2">
                  <LineupCard slate={slateKey} lineup={lu} teams={salaryTeams} positions={salaryPositions} />
                  <Button type="button" size="sm" variant="outline" onClick={() => startFrom(lu)}>
                    Start from this lineup
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
