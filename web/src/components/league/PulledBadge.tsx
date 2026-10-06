import { shortStamp } from "@/lib/format";

/** When ESPN was last read, on the app's ET clock. */
export function PulledBadge({ asOf }: { asOf: string | null | undefined }) {
  if (!asOf) return <span className="t-caption">ESPN has not been pulled yet</span>;
  return (
    <span className="t-caption" title={asOf}>
      Pulled from ESPN {shortStamp(asOf)} ET
    </span>
  );
}
