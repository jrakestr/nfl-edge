"use client";

import { usePathname, useRouter } from "next/navigation";
import { useGamesSelection, useLiveSearchParams } from "@/components/shell/GamesSelection";
import { useCallback, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageActions, SidebarFooter } from "@/components/shell/PageActions";
import { RunBadge, type RunOption } from "./RunBadge";
import { type Density } from "./PlainVerdictList";
import { type Filters, filtersToParams, type SlotFilter } from "./filters";

export type View = "plain" | "table";
export type { Density };

/**
 * Week selector, Plain English / Table toggle, filters (Table view), RunBadge. State lives
 * in the URL (`?view=`, `?density=`, `?run=`, `?min=`, `?flat=0`, `?slot=`) so links are shareable and
 * server components can read it. `[` / `]` step weeks.
 */
export function WeekHeader({
  season,
  week,
  weeks,
  view,
  density = "full",
  filters,
  run,
  runs,
  stale,
  linesAsOf = null,
  verdictsAsOf = null,
  linesSource = null,
}: {
  season: number;
  week: number;
  weeks: number[]; // weeks with a schedule, desc
  view: View;
  density?: Density;
  filters: Filters;
  run: RunOption | null;
  runs: RunOption[];
  stale: boolean;
  linesAsOf?: string | null;
  verdictsAsOf?: string | null;
  linesSource?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useLiveSearchParams();
  const { setSelected } = useGamesSelection();

  const go = useCallback(
    (nextWeek: number, patch?: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(params.toString());
      p.delete("run"); // a pinned run belongs to one week
      p.delete("games");
      setSelected([]);
      patch?.(p);
      const qs = p.toString();
      router.push(`/week/${nextWeek}${qs ? `?${qs}` : ""}`);
    },
    [params, router, setSelected],
  );

  const setParams = useCallback(
    (patch: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(params.toString());
      patch(p);
      const qs = p.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [params, pathname, router],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const asc = [...weeks].sort((a, b) => a - b);
      const i = asc.indexOf(week);
      if (e.key === "]" && i >= 0 && i < asc.length - 1) go(asc[i + 1]);
      if (e.key === "[" && i > 0) go(asc[i - 1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [weeks, week, go]);

  return (
    <>
      <PageActions>
        <div className="flex items-center gap-2">
          <Select value={String(week)} onValueChange={(v) => go(Number(v))}>
            <SelectTrigger aria-label="Week" className="h-8 w-[120px] rounded-md t-body">
              <SelectValue>{`Week ${week}`}</SelectValue>
            </SelectTrigger>
            <SelectContent align="end">
              {(weeks.includes(week) ? weeks : [week, ...weeks]).map((w) => (
                <SelectItem key={w} value={String(w)}>
                  Week {w}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="t-caption">{season}</span>
        </div>
      </PageActions>
      <SidebarFooter>
        <RunBadge run={run} runs={runs} stale={stale} linesAsOf={linesAsOf} verdictsAsOf={verdictsAsOf} linesSource={linesSource} />
      </SidebarFooter>

      {run ? (
      <div
        className="glass sticky top-[var(--topbar-height)] z-[9] flex flex-wrap items-center gap-3 border-b py-2"
        data-week-header=""
      >
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => {
            if (v) setParams((p) => (v === "plain" ? p.delete("view") : p.set("view", v)));
          }}
          aria-label="View"
          className="rounded-sm border border-border bg-card p-0.5"
        >
          <ToggleGroupItem value="plain" className="h-8 rounded-[4px] px-3 t-body font-semibold">
            Plain English
          </ToggleGroupItem>
          <ToggleGroupItem value="table" className="h-8 rounded-[4px] px-3 t-body font-semibold">
            Table
          </ToggleGroupItem>
        </ToggleGroup>

        {view === "plain" ? (
          <ToggleGroup
            type="single"
            value={density}
            onValueChange={(v) => {
              if (v) setParams((p) => (v === "full" ? p.delete("density") : p.set("density", v)));
            }}
            aria-label="Density"
            className="rounded-sm border border-border bg-card p-0.5"
          >
            <ToggleGroupItem value="full" className="h-8 rounded-[4px] px-3 t-body font-semibold">
              Full
            </ToggleGroupItem>
            <ToggleGroupItem value="compact" className="h-8 rounded-[4px] px-3 t-body font-semibold">
              Compact
            </ToggleGroupItem>
          </ToggleGroup>
        ) : null}

        {view === "table" ? (
          <div className="flex flex-wrap items-center gap-3" aria-label="Filters">
            <Select
              value={filters.slot}
              onValueChange={(v) => setFiltersClean({ ...filters, slot: v as SlotFilter }, setParams)}
            >
              <SelectTrigger aria-label="Kickoff slot" className="h-8 w-[148px] rounded-sm t-body">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All kickoffs</SelectItem>
                <SelectItem value="early">Early (1 PM)</SelectItem>
                <SelectItem value="late">Late (4 PM)</SelectItem>
                <SelectItem value="primetime">Primetime</SelectItem>
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 t-caption">
              <span>Min edge</span>
              <Slider
                aria-label="Minimum edge"
                min={0}
                max={10}
                step={1}
                value={[Math.round(filters.minEdge * 100)]}
                onValueCommit={([v]) => setFiltersClean({ ...filters, minEdge: v / 100 }, setParams)}
                className="w-28"
              />
              <span className="tnum w-7 text-foreground">{Math.round(filters.minEdge * 100)}%</span>
            </label>
            <Toggle
              pressed={filters.hideFlat}
              onPressedChange={(on) => setFiltersClean({ ...filters, hideFlat: on }, setParams)}
              aria-label="Hide flat"
              className="h-8 rounded-sm px-2.5 t-body font-semibold"
            >
              Hide flat
            </Toggle>
          </div>
        ) : null}
      </div>
      ) : null}
    </>
  );
}

function setFiltersClean(f: Filters, setParams: (patch: (p: URLSearchParams) => void) => void) {
  setParams((p) => {
    const next = filtersToParams(f, p);
    for (const k of ["min", "flat", "slot"]) p.delete(k);
    next.forEach((v, k) => p.set(k, v));
  });
}
