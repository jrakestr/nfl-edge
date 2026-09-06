"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { exportSelectedLineups } from "@/lib/actions/dfs-export";
import type { CorrPair, DfsExposure, DfsLineup } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { ExposureBar } from "./ExposureBar";
import { LineupCard, stacksFromPlayers } from "./LineupCard";
import { StackChip } from "./StackChip";
import { cn } from "@/lib/utils";

const SETTINGS = ["Randomness —", "Stacks % —", "Max exposure —"] as const;
type SortKey = "proj" | "win" | "roi";

function salaryBars(lineups: DfsLineup[]): { label: string; n: number }[] {
  const buckets = [
    { label: "≤48k", lo: 0, hi: 48000 },
    { label: "48–49k", lo: 48000, hi: 49000 },
    { label: "49–50k", lo: 49000, hi: 50001 },
  ];
  return buckets.map((b) => ({
    label: b.label,
    n: lineups.filter((l) => l.salary_used != null && l.salary_used >= b.lo && l.salary_used < b.hi).length,
  }));
}

export function LineupReview({
  week,
  site,
  slate,
  runId = null,
  slateId = "",
  lineups = [],
  exposure = [],
  teams = {},
  correlations = [],
}: {
  week: string;
  site: string;
  slate: string;
  runId?: string | null;
  slateId?: string;
  lineups?: DfsLineup[];
  exposure?: DfsExposure[];
  teams?: Record<string, string>;
  correlations?: CorrPair[];
}) {
  const [sort, setSort] = useState<SortKey>("win");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const siteKey = site === "fd" ? "fd" : "dk";
  const slateKey = ["main", "full", "showdown"].includes(slate) ? slate : "main";
  const sid = slateId;

  const sorted = useMemo(() => {
    const copy = [...lineups];
    copy.sort((a, b) => {
      const av = sort === "proj" ? a.proj_fpts : sort === "win" ? a.sim_win_pct : a.sim_roi;
      const bv = sort === "proj" ? b.proj_fpts : sort === "win" ? b.sim_win_pct : b.sim_roi;
      return (bv ?? -Infinity) - (av ?? -Infinity);
    });
    return copy;
  }, [lineups, sort]);

  const stackDist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lu of lineups) {
      for (const s of stacksFromPlayers(lu.players, teams)) {
        const key = `${s.team} ${s.count}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [lineups, teams]);

  const hist = salaryBars(lineups);
  const histMax = Math.max(1, ...hist.map((h) => h.n));

  async function onExport() {
    if (!runId || selected.size === 0) return;
    setBusy(true);
    try {
      const csv = await exportSelectedLineups({
        runId,
        site: siteKey,
        slateId: sid,
        lineupIds: [...selected],
      });
      const blob = new Blob([csv], { type: "text/csv" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `dk_upload_${sid}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="t-title">
            Week {week} · {site.toUpperCase()} · {slate}
          </h1>
          <Button
            type="button"
            size="sm"
            disabled={!runId || selected.size === 0 || busy}
            onClick={onExport}
          >
            Export selected
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <nav className="flex h-8 items-center gap-1" aria-label="Site">
            {(
              [
                ["dk", "DraftKings"],
                ["fd", "FanDuel"],
              ] as const
            ).map(([id, label]) => (
              <Link
                key={id}
                href={`/week/${week}/dfs/${id}/${slate}`}
                aria-current={siteKey === id ? "page" : undefined}
                className={cn(
                  "px-2 t-body",
                  siteKey === id ? "text-foreground font-semibold" : "text-muted-foreground",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
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
                href={`/week/${week}/dfs/${siteKey}/${id}`}
                aria-current={slateKey === id ? "page" : undefined}
                className={cn(
                  "px-2 t-body",
                  slateKey === id ? "text-foreground font-semibold" : "text-muted-foreground",
                )}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-wrap gap-1.5">
            {SETTINGS.map((s) => (
              <span key={s} className="rounded-md border border-border px-2 py-1 t-caption">
                {s}
              </span>
            ))}
          </div>
        </div>
        {lineups.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {(["win", "proj", "roi"] as const).map((k) => (
              <Button
                key={k}
                type="button"
                size="sm"
                variant={sort === k ? "secondary" : "outline"}
                onClick={() => setSort(k)}
              >
                {k === "win" ? "Win %" : k === "proj" ? "Proj" : "ROI"}
              </Button>
            ))}
          </div>
        ) : (
          <p className="t-caption">
            Lineups fill in with dfs-web. Export is stamped with run_id when model.dfs_lineups exists.
          </p>
        )}
      </header>

      <div className="flex flex-col gap-4 lg:flex-row">
        <section className="flex min-w-0 flex-[2] flex-col gap-3" aria-label="Lineups">
          {sorted.length === 0 ? (
            <>
              <LineupCard
                lineup={{
                  lineup_id: "empty",
                  salary_used: null,
                  stack: null,
                  proj_fpts: null,
                  sim_win_pct: null,
                  sim_roi: null,
                  players: [],
                }}
              />
              <p className="t-caption">No lineups for this slate yet.</p>
            </>
          ) : (
            sorted.map((lu) => (
              <LineupCard
                key={lu.lineup_id}
                lineup={lu}
                teams={teams}
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
        <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-[340px]">
          <section className="card flex flex-col gap-3 p-4">
            <h2 className="t-body font-semibold">Exposure vs field</h2>
            {exposure.length === 0 ? (
              <>
                <ExposureBar name="—" />
                <p className="t-caption">Sorted by leverage once dfs-web writes exposure.</p>
              </>
            ) : (
              exposure.slice(0, 20).map((e) => (
                <ExposureBar key={e.player_id} name={e.name} mine={e.sim_own} field={e.proj_own} />
              ))
            )}
          </section>
          <section className="card flex flex-col gap-2 p-4">
            <h2 className="t-body font-semibold">Team stacks</h2>
            {stackDist.length === 0 ? (
              <StackChip />
            ) : (
              stackDist.map(([label, n]) => {
                const [team, count] = label.split(" ");
                return (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <StackChip team={team} count={Number(count)} />
                    <span className="tnum t-caption">{n}</span>
                  </div>
                );
              })
            )}
            {correlations.length > 0 ? (
              <div className="mt-2 flex flex-col gap-1">
                <h3 className="t-caption font-semibold text-foreground">Why these stacks</h3>
                {correlations.map((c) => (
                  <p key={`${c.a}-${c.b}`} className="t-caption">
                    {c.a} / {c.b}{" "}
                    <span className="tnum text-foreground">{c.corr.toFixed(2)}</span>
                  </p>
                ))}
              </div>
            ) : null}
          </section>
          <section className="card p-4">
            <h2 className="t-body font-semibold">Salary used</h2>
            {lineups.length === 0 ? (
              <>
                <div className="mt-2 h-16 rounded-md bg-muted" aria-hidden />
                <p className="mt-2 t-caption">Histogram of salary remaining across the build.</p>
              </>
            ) : (
              <div className="mt-2 flex items-end gap-2" aria-label="Salary histogram">
                {hist.map((h) => (
                  <div key={h.label} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-sm bg-foreground/20"
                      style={{ height: `${Math.max(8, (h.n / histMax) * 64)}px` }}
                    />
                    <span className="t-caption">{h.label}</span>
                    <span className="tnum t-caption">{h.n}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
