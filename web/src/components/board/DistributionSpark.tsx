/** 40×16 density spark from a 20-bin hist. Neutral; marker in --line when a prop line exists. */
export function DistributionSpark({
  counts,
  bins,
  marker,
}: {
  counts?: number[] | null;
  bins?: number[] | null;
  marker?: number | null;
}) {
  const max = Math.max(1, ...(counts ?? []));
  let markerPct: number | null = null;
  if (marker != null && bins && bins.length >= 2) {
    const lo = bins[0]!;
    const hi = bins[bins.length - 1]!;
    if (hi > lo) markerPct = Math.min(100, Math.max(0, ((marker - lo) / (hi - lo)) * 100));
  }
  return (
    <span
      className="relative inline-flex h-4 w-10 items-end gap-px overflow-hidden rounded-sm bg-muted"
      role="img"
      aria-label={counts?.length ? "Sim density" : "No distribution"}
    >
      {(counts ?? Array.from({ length: 20 }, () => 0)).slice(0, 20).map((c, i) => (
        <span
          key={i}
          className="min-w-0 flex-1 rounded-sm bg-foreground/40"
          style={{ height: `${Math.max(8, (c / max) * 100)}%` }}
        />
      ))}
      {markerPct != null ? (
        <span
          aria-hidden
          className="absolute inset-y-0 w-px bg-line"
          style={{ left: `${markerPct}%` }}
        />
      ) : null}
    </span>
  );
}
