"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { draws, shortRun, shortStampLocal } from "@/lib/format";
import { cn } from "@/lib/utils";

export type RunOption = {
  run_id: string;
  created_at: string; // ISO
  draws_per_game: number | null;
  git_sha: string | null;
  draws_pruned?: boolean;
};

/**
 * `run 5823f7 · 20k · lines as of Sat 10:32 · verdicts as of Sat 10:33` in the viewer's
 * local clock. --warn when a newer run exists or lines/verdicts timestamps drift.
 */
export function RunBadge({
  run,
  runs,
  stale,
  linesAsOf = null,
  verdictsAsOf = null,
  linesSource = null,
  className,
}: {
  run: RunOption | null;
  runs: RunOption[];
  stale: boolean;
  linesAsOf?: string | null;
  verdictsAsOf?: string | null;
  linesSource?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  if (!run) {
    return (
      <span className={cn("tnum t-caption font-medium text-foreground", className)}>
        lines as of {linesAsOf ? shortStampLocal(linesAsOf) : "—"}
        {linesSource ? ` · ${linesSource}` : ""}
      </span>
    );
  }

  const drift =
    !!linesAsOf &&
    !!verdictsAsOf &&
    new Date(linesAsOf).getTime() !== new Date(verdictsAsOf).getTime();
  const warn = stale || drift;
  const sourceBit = linesSource ? ` · ${linesSource}` : "";
  const asOf = `lines as of ${linesAsOf ? shortStampLocal(linesAsOf) : "—"}${sourceBit} · verdicts as of ${
    verdictsAsOf ? shortStampLocal(verdictsAsOf) : "—"
  }`;
  const pruned = run.draws_pruned ? " · draws pruned" : "";
  const label = `run ${shortRun(run.run_id)} · ${draws(run.draws_per_game)}${pruned} · ${asOf}`;

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
        aria-label={`${label}${stale ? " (a newer run exists)" : ""}${drift ? " (verdicts behind the line)" : ""}`}
        data-stale={warn ? "true" : undefined}
        className={cn(
          "tnum t-caption h-8 w-full justify-between rounded-md border bg-card px-2 font-medium shadow-none",
          warn ? "border-warn text-warn" : "border-border",
          className,
        )}
      >
        <SelectValue>{label}</SelectValue>
      </SelectTrigger>
      <SelectContent align="start">
        {runs.map((r, i) => (
          <SelectItem key={r.run_id} value={r.run_id} className="tnum t-caption">
            run {shortRun(r.run_id)} · {shortStampLocal(r.created_at)} · {draws(r.draws_per_game)}
            {r.draws_pruned ? " · draws pruned" : ""}
            {i === 0 ? " · newest" : ""}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
