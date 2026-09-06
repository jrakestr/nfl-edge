const STRIP = ["Line", "Over", "Under", "Cleared it, last 10", "Average", "Typical sim game", "Chance of over"];

/** Outlier-style bar chart. Empty skeleton until player_stats_weekly + a line exist. */
export function StatBars() {
  return (
    <section className="card p-4" data-slot="stat-bars">
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {STRIP.map((label) => (
          <div key={label}>
            <div className="t-colhead text-dim">{label}</div>
            <div className="t-body text-dim">—</div>
          </div>
        ))}
      </div>
      <div className="relative h-24 rounded-md bg-muted">
        <div
          aria-hidden
          className="absolute inset-y-3 left-1/2 w-px border-l border-dashed border-line"
        />
        <p className="absolute inset-0 flex items-center justify-center t-caption">No games logged</p>
      </div>
    </section>
  );
}
