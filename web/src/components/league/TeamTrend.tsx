import type { LeagueTeamWeek } from "@/lib/league";

/**
 * Actual minus projected, one bar per final week, scaled to the largest gap on this team. The bar
 * is the only encoding; the number sits beside it. Bars use the edge tokens, so only the sign is colored.
 */
export function TeamTrend({ rows }: { rows: LeagueTeamWeek[] }) {
  const finals = rows.filter((r) => r.is_final);
  if (finals.length === 0) return null;
  const max = Math.max(...finals.map((r) => Math.abs(r.own_pm)), 1);
  return (
    <section className="card flex flex-col gap-2 p-4" aria-label="Actual minus projected by week">
      <h2 className="t-body font-semibold">Actual minus projected, by week</h2>
      <ul className="flex flex-col gap-1">
        {finals.map((r) => {
          const pct = (Math.abs(r.own_pm) / max) * 50;
          const pos = r.own_pm >= 0;
          return (
            <li key={r.week} className="grid grid-cols-[4rem_1fr_4rem] items-center gap-3">
              <span className="t-caption">Week {r.week}</span>
              <span className="relative h-3 rounded-sm bg-muted" role="img" aria-label={`Week ${r.week} ${r.own_pm.toFixed(1)} points against projection`}>
                <span className="absolute inset-y-0 left-1/2 w-px bg-border" aria-hidden />
                <span
                  className={`absolute inset-y-0 rounded-sm ${pos ? "bg-edge-pos" : "bg-edge-neg"}`}
                  style={pos ? { left: "50%", width: `${pct}%` } : { right: "50%", width: `${pct}%` }}
                />
              </span>
              <span className="t-body tnum text-right">{`${pos ? "+" : "−"}${Math.abs(r.own_pm).toFixed(1)}`}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
