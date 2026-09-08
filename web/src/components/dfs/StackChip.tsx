import { MetricIcon } from "@/lib/icons";

export type Stack = { team: string; count: number; bringBack?: boolean };

/** `SEA 3` / bring-back marker. */
export function StackChip({ team, count, bringBack }: Partial<Stack>) {
  if (!team || count == null) {
    return (
      <span className="inline-flex items-center gap-1 t-caption">
        <MetricIcon metric="stack" />
        No stacks yet
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-sm bg-accent px-1.5 py-0.5 t-caption text-foreground">
      <MetricIcon metric="stack" />
      {team} {count}
      {bringBack ? " + bring-back" : ""}
    </span>
  );
}
