import type { CheckStatusValue } from "@/lib/types";
import { cn } from "@/lib/utils";

const LABEL: Record<CheckStatusValue, string> = {
  ok: "All invariants passed",
  warn: "Warnings present",
  fail: "Invariant failed; edges withheld",
};

const DOT: Record<CheckStatusValue, string> = {
  ok: "bg-edge-pos",
  warn: "bg-warn",
  fail: "bg-edge-neg",
};

/**
 * Invariant/warning roll-up as a dot with a DOM label (color never carries meaning alone).
 * `failed` lists the check names for the title/tooltip.
 */
export function CheckStatus({
  status,
  failed = [],
  showLabel = false,
  className,
}: {
  status: CheckStatusValue;
  failed?: string[];
  showLabel?: boolean;
  className?: string;
}) {
  const detail = failed.length ? `${LABEL[status]}: ${failed.join(", ")}` : LABEL[status];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      role="status"
      aria-label={detail}
      title={detail}
      data-status={status}
    >
      <span aria-hidden className={cn("inline-block size-2 rounded-full", DOT[status])} />
      {showLabel ? <span className="t-caption text-muted-foreground">{LABEL[status]}</span> : null}
      <span className="sr-only">{detail}</span>
    </span>
  );
}
