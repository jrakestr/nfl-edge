"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { draws, shortRun, shortStamp } from "@/lib/format";
import { cn } from "@/lib/utils";

export type RunOption = {
  run_id: string;
  created_at: string; // ISO
  draws_per_game: number | null;
  git_sha: string | null;
};

/**
 * `run 5823f7 · Sat 06:30 · 20k` in caption type. --warn border when a newer run exists for
 * the week. Clicking opens the week's runs; choosing one pins `?run=`. Run diff: web-refine.
 */
export function RunBadge({
  run,
  runs,
  stale,
  className,
}: {
  run: RunOption;
  runs: RunOption[];
  stale: boolean;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const label = `run ${shortRun(run.run_id)} · ${shortStamp(run.created_at)} · ${draws(run.draws_per_game)}`;

  const onChange = (value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value === runs[0]?.run_id) next.delete("run");
    else next.set("run", value);
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <Select value={run.run_id} onValueChange={onChange}>
      <SelectTrigger
        aria-label={`${label}${stale ? " (a newer run exists)" : ""}`}
        data-stale={stale ? "true" : undefined}
        className={cn(
          "tnum h-7 w-full justify-between rounded-md border bg-card px-2 text-[11px] leading-4 font-medium text-muted-foreground shadow-none",
          stale ? "border-warn text-warn" : "border-border",
          className,
        )}
      >
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        {runs.map((r, i) => (
          <SelectItem key={r.run_id} value={r.run_id} className="tnum text-[12px]">
            run {shortRun(r.run_id)} · {shortStamp(r.created_at)} · {draws(r.draws_per_game)}
            {i === 0 ? " · newest" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
