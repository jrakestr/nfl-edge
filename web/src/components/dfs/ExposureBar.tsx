import { EdgeCell } from "@/components/board/EdgeCell";
import { MetricLabel } from "@/lib/icons";
import { pct } from "@/lib/edge";

function width(v: number | null | undefined): string {
  if (v == null || v <= 0) return "0%";
  return `${Math.min(100, v * 100)}%`;
}

function fmtPct(v: number | null | undefined): string {
  return v == null ? "—" : pct(v);
}

/**
 * Mine vs field ownership. Three thin bars (mine, simulated field, projected
 * field); leverage is mine − simulated field. With hideLeverage the numbers
 * print without a difference — used when the sim's field was our own lineups.
 */
export function ExposureBar({
  name,
  mine,
  field,
  fieldProj,
  hideLeverage = false,
}: {
  name: string;
  mine?: number | null;
  field?: number | null;
  fieldProj?: number | null;
  hideLeverage?: boolean;
}) {
  const lev = !hideLeverage && mine != null && field != null ? mine - field : null;
  return (
    <div className="flex flex-col gap-1" aria-label={`${name} exposure`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="t-body truncate font-semibold text-foreground">{name}</span>
        {lev == null ? (
          <span className="tnum inline-flex items-baseline gap-1 whitespace-nowrap">
            <span className="text-foreground font-semibold">{fmtPct(mine)}</span>
            <span className="text-line font-semibold">{fmtPct(field)}</span>
            <span className="t-caption text-muted-foreground">{fmtPct(fieldProj)}</span>
          </span>
        ) : (
          <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
            <EdgeCell model={mine} market={field} kind="pct" edge={lev} />
            <span className="tnum t-caption text-muted-foreground">{fmtPct(fieldProj)}</span>
          </span>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="h-1 overflow-hidden rounded-sm bg-border-soft" aria-hidden>
          <span className="block h-1 rounded-sm bg-foreground" style={{ width: width(mine) }} />
        </span>
        <span className="h-1 overflow-hidden rounded-sm bg-border-soft" aria-hidden>
          <span className="block h-1 rounded-sm bg-line" style={{ width: width(field) }} />
        </span>
        <span className="h-1 overflow-hidden rounded-sm bg-border-soft" aria-hidden>
          <span
            className="block h-1 rounded-sm bg-muted-foreground/50"
            style={{ width: width(fieldProj) }}
          />
        </span>
      </div>
      <span className="t-caption">
        <MetricLabel metric="leverage">Mine · Field (simulated) · Field (projected)</MetricLabel>
      </span>
    </div>
  );
}
