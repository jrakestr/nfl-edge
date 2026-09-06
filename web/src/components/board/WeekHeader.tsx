"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageActions, SidebarFooter } from "@/components/shell/PageActions";
import { RunBadge, type RunOption } from "./RunBadge";
import { type Filters, filtersToParams, type SlotFilter } from "./filters";

export type View = "plain" | "table";

/**
 * Week selector, Plain English / Table toggle, filters (Table view), RunBadge. State lives
 * in the URL (`?view=`, `?run=`, `?min=`, `?flat=0`, `?slot=`) so links are shareable and
 * server components can read it. `[` / `]` step weeks.
 */
export function WeekHeader({
  season,
  week,
  weeks,
  view,
  filters,
  run,
  runs,
  stale,
}: {
  season: number;
  week: number;
  weeks: number[]; // weeks with a run, desc
  view: View;
  filters: Filters;
  run: RunOption | null;
  runs: RunOption[];
  stale: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const go = useCallback(
    (nextWeek: number, patch?: (p: URLSearchParams) => void) => {
      const p = new URLSearchParams(params.toString());
      p.delete("run"); // a pinned run belongs to one week
      patch?.(p);
      const qs = p.toString();
      router.push(`/week/${nextWeek}${qs ? `?${qs}` : ""}`);
    },
    [params, router],
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
            <SelectTrigger aria-label="Week" className="h-8 w-[120px] rounded-md text-[13px]">
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
        {run ? <RunBadge run={run} runs={runs} stale={stale} /> : <span className="t-caption">no run for week {week}</span>}
      </SidebarFooter>

      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => {
            if (v) setParams((p) => (v === "plain" ? p.delete("view") : p.set("view", v)));
          }}
          aria-label="View"
          className="rounded-sm border border-border bg-card p-0.5"
        >
          <ToggleGroupItem value="plain" className="h-7 rounded-[4px] px-3 text-[12px] font-semibold">
            Plain English
          </ToggleGroupItem>
          <ToggleGroupItem value="table" className="h-7 rounded-[4px] px-3 text-[12px] font-semibold">
            Table
          </ToggleGroupItem>
        </ToggleGroup>

        {view === "table" ? (
          <div className="flex flex-wrap items-center gap-3" aria-label="Filters">
            <Select
              value={filters.slot}
              onValueChange={(v) => setFiltersClean({ ...filters, slot: v as SlotFilter }, setParams)}
            >
              <SelectTrigger aria-label="Kickoff slot" className="h-7 w-[132px] rounded-sm text-[12px]">
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
              className="h-7 rounded-sm px-2.5 text-[12px]"
            >
              Hide flat
            </Toggle>
          </div>
        ) : null}
      </div>
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
