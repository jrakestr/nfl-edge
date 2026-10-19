"use client";

import { usePathname, useRouter } from "next/navigation";
import { useGamesSelection, useLiveSearchParams } from "@/components/shell/GamesSelection";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENT_SEASON, REG_WEEKS } from "@/lib/config";

const WEEK_PATH = /^\/week\/(\d+)\/(.+)$/;

/** Week id and the sub-path after it, or null off the week sub-pages (the board has its own selector). */
export function weekSubpath(pathname: string): { week: number; rest: string } | null {
  const m = WEEK_PATH.exec(pathname);
  return m ? { week: Number(m[1]), rest: m[2]! } : null;
}

/** Same page, different week. Drops the pinned run and games selection, which belong to one week. */
export function weekHref(rest: string, week: number, search: URLSearchParams): string {
  const p = new URLSearchParams(search.toString());
  p.delete("run");
  p.delete("games");
  p.delete("contest");
  const qs = p.toString();
  return `/week/${week}/${rest}${qs ? `?${qs}` : ""}`;
}

export function WeekSwitcher() {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const search = useLiveSearchParams();
  const { setSelected } = useGamesSelection();
  const ctx = weekSubpath(pathname);
  if (!ctx) return null;
  const weeks = Array.from({ length: REG_WEEKS }, (_, i) => i + 1);
  if (!weeks.includes(ctx.week)) weeks.push(ctx.week);
  return (
    <div className="flex items-center gap-2">
      <Select
        value={String(ctx.week)}
        onValueChange={(v) => {
          const next = Number(v);
          if (!next || next === ctx.week) return;
          setSelected([]);
          router.push(weekHref(ctx.rest, next, search));
        }}
      >
        <SelectTrigger aria-label="Week" className="h-8 w-[120px] rounded-md t-body">
          <SelectValue>{`Week ${ctx.week}`}</SelectValue>
        </SelectTrigger>
        <SelectContent align="end">
          {weeks.map((w) => (
            <SelectItem key={w} value={String(w)}>
              Week {w}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="t-caption">{CURRENT_SEASON}</span>
    </div>
  );
}
