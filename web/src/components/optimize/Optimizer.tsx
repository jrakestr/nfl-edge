"use client";

import { useMemo, useState } from "react";
import { GameStrip } from "@/components/shell/GameStrip";
import { useGamesSelection } from "@/components/shell/GamesSelection";
import { SlateSelector } from "@/components/shell/SlateSelector";
import { selectedOnSlate } from "@/lib/games-param";
import type { StripGame } from "@/lib/kickoff";
import { LineupCard } from "@/components/dfs/LineupCard";
import { PhraseBox } from "@/components/optimize/PhraseBox";
import { StackSuggestions } from "@/components/optimize/StackSuggestions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatUploadCsv, uploadFilename } from "@/lib/dfs-upload";
import { fallbackNotice } from "@/lib/slate";
import { useSlatePicks } from "@/lib/slate-picks";
import { classicForcedInError, flexConstructionError } from "@/lib/optimize/classic";
import { applySolveControls, parseSolveControls } from "@/lib/optimize/controls-url";
import { poolFromPlayers } from "@/lib/optimize/pool";
import { solveSlate } from "@/lib/optimize/solve";
import { type FlexPos, type SolveControls, type SolvedLineup } from "@/lib/optimize/types";
import { useUrlBoundState } from "@/lib/url-bound-state";
import type { SlateCorr } from "@/lib/optimize/stack-suggestions";
import type { DfsLineup, WeekPlayer } from "@/lib/types";

function asDfs(lu: SolvedLineup): DfsLineup {
  return {
    lineup_id: lu.lineup_id,
    salary_used: lu.salary_used,
    stack: lu.stack,
    proj_fpts: lu.proj_fpts,
    sim_win_pct: null,
    sim_roi: null,
    players: lu.players.map((p) => ({ slot: p.slot, name: p.name, dk_id: p.dk_id })),
  };
}

function numField(
  label: string,
  value: number,
  onChange: (n: number) => void,
  min: number,
  max: number,
  step = 1,
) {
  return (
    <label className="flex min-w-24 flex-col gap-1">
      <span className="t-colhead text-muted-foreground">{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
      />
    </label>
  );
}

export function Optimizer({
  week,
  site,
  slate,
  slates = [],
  slateId = "",
  runId = null,
  players = [],
  pairs = [],
  simLineups = [],
  teams = {},
  positions = {},
  fallbackFrom = null,
  buildInProgress = false,
  strip = [],
}: {
  week: number | string;
  site: string;
  slate: string;
  slates?: string[];
  slateId?: string;
  runId?: string | null;
  players?: WeekPlayer[];
  pairs?: SlateCorr[];
  simLineups?: DfsLineup[];
  teams?: Record<string, string>;
  positions?: Record<string, string>;
  fallbackFrom?: string | null;
  buildInProgress?: boolean;
  strip?: StripGame[];
}) {
  const showdown = slate === "showdown";
  const { picks, setPicks } = useSlatePicks(slateId);
  const { selected: selectedGames } = useGamesSelection();
  const [controls, setControls] = useUrlBoundState({
    parse: (sp) => parseSolveControls(sp, showdown),
    apply: (next, base) => applySolveControls(next, base, showdown),
  });
  const [yours, setYours] = useState<SolvedLineup[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState("yours");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const active = selectedOnSlate(
      selectedGames,
      strip.map((g) => g.game_id),
    );
    if (!active.length) return players;
    const set = new Set(active);
    return players.filter((p) => p.game_id != null && set.has(p.game_id));
  }, [players, selectedGames, strip]);
  const { pool, poolError } = useMemo(() => {
    try {
      return { pool: poolFromPlayers(visible, { uniquePlayerId: !showdown }), poolError: null };
    } catch (e) {
      return {
        pool: [] as ReturnType<typeof poolFromPlayers>,
        poolError: e instanceof Error ? e.message : "A player appears twice in this slate's pool.",
      };
    }
  }, [visible, showdown]);
  const yoursTeams = useMemo(() => {
    const m = { ...teams };
    for (const lu of yours) {
      for (const p of lu.players) m[p.name.toLowerCase()] = p.team;
    }
    return m;
  }, [teams, yours]);

  function patch(partial: Partial<SolveControls>) {
    setControls((c) => ({
      ...c,
      ...partial,
      flexEligible: { ...c.flexEligible, ...partial.flexEligible },
    }));
  }

  async function generate() {
    const visibleIds = new Set(visible.map((p) => p.player_dk_id).filter((id): id is string => Boolean(id)));
    const missingLocks = picks.lock.filter(
      (id) => players.some((p) => p.player_dk_id === id) && !visibleIds.has(id),
    );
    if (missingLocks.length) {
      const names = missingLocks.map(
        (id) => players.find((p) => p.player_dk_id === id)?.display_name ?? id,
      );
      setError(
        names.length === 1
          ? `${names[0]} is locked but not in the selected games`
          : `${names.join(", ")} are locked but not in the selected games`,
      );
      return;
    }
    const live = {
      ...controls,
      locks: picks.lock,
      excludes: picks.excl,
      stackIds: picks.stack,
    };
    if (!showdown) {
      const conflict = flexConstructionError(live) ?? classicForcedInError(pool, live);
      if (conflict) {
        setError(conflict);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const result = await solveSlate(pool, live, showdown);
      setYours(result);
      setSelected(new Set(result.map((l) => l.lineup_id)));
      setTab("yours");
      if (result.length === 0) setError("No feasible lineups for these locks and rules.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Solve failed");
    } finally {
      setBusy(false);
    }
  }

  function startFrom(lu: DfsLineup) {
    const lock = lu.players.map((p) => p.dk_id).filter((id): id is string => Boolean(id));
    setPicks({ lock, excl: picks.excl, stack: picks.stack });
    setTab("yours");
  }

  function download() {
    if (!runId) return;
    const picked = yours.filter((l) => selected.has(l.lineup_id)).map(asDfs);
    if (!picked.length) return;
    const csv = formatUploadCsv(picked);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = uploadFilename(slateId, runId, "user-optimized");
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="t-title">Optimize</h1>
          <Button type="button" size="sm" disabled={!runId || selected.size === 0} onClick={download}>
            Export selected
          </Button>
        </div>
        <SlateSelector week={week} site={site} page="optimize" slate={slate} slates={slates} />
        {fallbackFrom ? <p className="t-caption text-warn">{fallbackNotice(fallbackFrom)}</p> : null}
        {buildInProgress ? (
          <p className="t-caption text-warn" role="note">
            Sunday build in progress
          </p>
        ) : null}
      </header>
      {strip.length ? <GameStrip games={strip} /> : null}

      <section className="card p-4" aria-label="Optimizer settings">
        <div className="flex flex-wrap items-end gap-3">
          {numField("Lineups", controls.lineups, (lineups) => patch({ lineups }), 1, 20)}
          {numField("Cap", controls.salaryCap, (salaryCap) => patch({ salaryCap }), 0, 100000, 100)}
          {numField("Min salary", controls.minSalary, (minSalary) => patch({ minSalary }), 0, 100000, 100)}
          {numField("Max exp %", controls.maxExposure, (maxExposure) => patch({ maxExposure }), 0, 100)}
          {numField("Max / team", controls.maxPerTeam, (maxPerTeam) => patch({ maxPerTeam }), 1, 9)}
          {numField("Random %", controls.randomness, (randomness) => patch({ randomness }), 0, 30)}
          {!showdown
            ? numField("QB + n WR/TE", controls.stackN, (stackN) => patch({ stackN }), 0, 3)
            : null}
          {!showdown
            ? numField("Bring-back", controls.bringBack, (bringBack) => patch({ bringBack }), 0, 2)
            : null}
          {!showdown
            ? (["RB", "WR", "TE"] as FlexPos[]).map((pos) => (
                <label key={pos} className="flex items-center gap-2 pb-1 t-body text-foreground">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={controls.flexEligible[pos]}
                    onChange={(e) =>
                      patch({ flexEligible: { ...controls.flexEligible, [pos]: e.target.checked } })
                    }
                  />
                  FLEX {pos}
                </label>
              ))
            : null}
          {!showdown ? (
            <label className="flex items-center gap-2 pb-1 t-body text-foreground">
              <input
                type="checkbox"
                className="size-4"
                checked={controls.noQbVsDst}
                onChange={(e) => patch({ noQbVsDst: e.target.checked })}
              />
              No QB vs opposing DST
            </label>
          ) : null}
          {!showdown ? (
            <label className="flex items-center gap-2 pb-1 t-body text-foreground">
              <input
                type="checkbox"
                className="size-4"
                checked={controls.requireStack}
                onChange={(e) => patch({ requireStack: e.target.checked })}
              />
              Require stacked group
            </label>
          ) : null}
          <Button type="button" disabled={busy || pool.length === 0} onClick={generate}>
            {busy ? "Solving…" : "Generate"}
          </Button>
        </div>
        <PhraseBox
          pool={pool}
          week={week}
          site={site}
          slate={slate}
          lock={picks.lock}
          stack={picks.stack}
          onApply={({ patch, excl, stack }) => {
            if (patch && Object.keys(patch).length) {
              setControls((c) => ({ ...c, ...patch }));
            }
            if (excl.length || stack.length) {
              setPicks({
                ...picks,
                excl: excl.length ? [...new Set([...picks.excl, ...excl])] : picks.excl,
                stack: stack.length ? [...new Set([...picks.stack, ...stack])] : picks.stack,
              });
            }
          }}
        />
        <p className="mt-2 t-caption">
          Elevated-by-injury marks backups whose starter is out. The sim does not reallocate vacated
          share, so the projection is still a backup&apos;s prior — useful as a human override, not as
          the model&apos;s opinion.
          {pool.some((p) => p.depthAsOf)
            ? ` Depth snapshot ${pool.find((p) => p.depthAsOf)?.depthAsOf}.`
            : ""}
        </p>
        <p className="mt-3 t-caption">
          Pool {pool.length} · locked {picks.lock.length} · excluded {picks.excl.length}
        </p>
        <p className="t-caption">Max exposure does not apply to locked players or a required stack.</p>
        <StackSuggestions
          players={players}
          pairs={pairs}
          locks={picks.lock}
          excludes={picks.excl}
          stack={picks.stack}
          onAdd={(partnerDkId, anchorDkId) => {
            const next = new Set(picks.stack);
            next.add(partnerDkId);
            next.add(anchorDkId);
            setPicks({ ...picks, stack: [...next] });
          }}
        />
        {poolError || error ? (
          <p className="mt-2 t-body text-warn" role="status">
            {poolError ?? error}
          </p>
        ) : null}
      </section>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="yours">Yours</TabsTrigger>
          <TabsTrigger value="sim">Sim 150</TabsTrigger>
        </TabsList>
        <TabsContent value="yours" className="flex flex-col gap-3 pt-3">
          {yours.length === 0 ? (
            <p className="t-body text-muted-foreground">No user lineups yet.</p>
          ) : (
            yours.map((lu) => (
              <LineupCard
                key={lu.lineup_id}
                lineup={asDfs(lu)}
                teams={yoursTeams}
                positions={Object.fromEntries(lu.players.map((p) => [p.name.toLowerCase(), p.position]))}
                selected={selected.has(lu.lineup_id)}
                onToggle={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(lu.lineup_id)) next.delete(lu.lineup_id);
                    else next.add(lu.lineup_id);
                    return next;
                  })
                }
                slate={slate}
                ownershipSum={lu.ownership_sum}
              />
            ))
          )}
        </TabsContent>
        <TabsContent value="sim" className="flex flex-col gap-3 pt-3">
          {simLineups.length === 0 ? (
            <p className="t-body text-muted-foreground">No simulated lineups for this slate yet.</p>
          ) : (
            simLineups.map((lu) => (
              <div key={lu.lineup_id} className="flex flex-col gap-2">
                <LineupCard lineup={lu} teams={teams} positions={positions} slate={slate} />
                <Button type="button" size="sm" variant="outline" onClick={() => startFrom(lu)}>
                  Start from this lineup
                </Button>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
