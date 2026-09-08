import { EdgeCell } from "@/components/board/EdgeCell";

function width(v: number | null | undefined): string {
  if (v == null || v <= 0) return "0%";
  return `${Math.min(100, v * 100)}%`;
}

/** Mine vs field ownership. Two thin bars; leverage is mine − field. */
export function ExposureBar({
  name,
  mine,
  field,
}: {
  name: string;
  mine?: number | null;
  field?: number | null;
}) {
  const lev = mine != null && field != null ? mine - field : null;
  return (
    <div className="flex flex-col gap-1" aria-label={`${name} exposure`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="t-body truncate font-semibold text-foreground">{name}</span>
        <EdgeCell model={mine ?? null} market={field ?? null} kind="pct" edge={lev} />
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="h-1 overflow-hidden rounded-sm bg-border-soft" aria-hidden>
          <span className="block h-1 rounded-sm bg-foreground" style={{ width: width(mine) }} />
        </span>
        <span className="h-1 overflow-hidden rounded-sm bg-border-soft" aria-hidden>
          <span className="block h-1 rounded-sm bg-line" style={{ width: width(field) }} />
        </span>
      </div>
      <span className="t-caption">Mine · field</span>
    </div>
  );
}
