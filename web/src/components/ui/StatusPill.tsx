import { cn } from "@/lib/utils";
import { statusPill } from "@/lib/injury-status";

/** OUT / D / Q from raw.player_overrides. --warn is the injury token. */
export function StatusPill({
  status,
  className,
}: {
  status: string | null | undefined;
  className?: string;
}) {
  const label = statusPill(status);
  if (!label) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-sm bg-warn/15 px-1.5 t-caption font-semibold text-warn",
        className,
      )}
      aria-label={label}
    >
      {label}
    </span>
  );
}
