import { weeklyValue } from "@/lib/prop-stats";
import type { PlayerWeek } from "@/lib/types";
import { pct, price } from "@/lib/edge";

function numOrDash(v: number | null | undefined, digits = 0): string {
  if (v == null) return "—";
  return v.toFixed(digits);
}

/** Outlier-style bar chart: one bar per recent game vs the entered line. */
export function StatBars({
  log,
  stat,
  line,
  overOdds,
  underOdds,
  typical,
  pOver,
}: {
  log: PlayerWeek[];
  stat: string;
  line: number | null;
  overOdds?: number | null;
  underOdds?: number | null;
  typical?: number | null;
  pOver?: number | null;
}) {
  const values = log.map((g) => weeklyValue(g.stats, stat));
  const last10 = values.slice(0, 10).filter((v): v is number => v != null);
  const cleared = line == null ? 0 : last10.filter((v) => v > line).length;
  const avg = last10.length ? last10.reduce((a, b) => a + b, 0) / last10.length : null;
  const max = Math.max(line ?? 0, ...values.filter((v): v is number => v != null), 1);

  return (
    <section className="card p-4" data-slot="stat-bars">
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        <div>
          <div className="t-colhead text-muted-foreground">Line</div>
          <div className="t-body tnum font-semibold text-foreground">{line != null ? line : "—"}</div>
        </div>
        <div>
          <div className="t-colhead text-muted-foreground">Over</div>
          <div className="t-body tnum font-semibold text-foreground">{price(overOdds)}</div>
        </div>
        <div>
          <div className="t-colhead text-muted-foreground">Under</div>
          <div className="t-body tnum font-semibold text-foreground">{price(underOdds)}</div>
        </div>
        <div>
          <div className="t-colhead text-muted-foreground">Cleared it, last 10</div>
          <div className="t-body tnum font-semibold text-foreground">{last10.length ? `${cleared}/${last10.length}` : "—"}</div>
        </div>
        <div>
          <div className="t-colhead text-muted-foreground">Average</div>
          <div className="t-body tnum font-semibold text-foreground">{numOrDash(avg, 1)}</div>
        </div>
        <div>
          <div className="t-colhead text-muted-foreground">Typical sim game</div>
          <div className="t-body tnum font-semibold text-foreground">{numOrDash(typical, 1)}</div>
        </div>
        <div>
          <div className="t-colhead text-muted-foreground">Chance of over</div>
          <div className="t-body tnum font-semibold text-foreground">{pct(pOver)}</div>
        </div>
      </div>
      <div className="relative flex h-24 items-end gap-1 rounded-md bg-muted px-2 py-2">
        {line != null ? (
          <div
            aria-hidden
            className="absolute inset-x-2 border-t border-dashed border-line"
            style={{ bottom: `${Math.min(100, (line / max) * 100)}%` }}
          />
        ) : null}
        {log.length === 0 ? (
          <p className="absolute inset-0 flex items-center justify-center t-caption">No games logged</p>
        ) : (
          log
            .slice()
            .reverse()
            .map((g, i) => {
              const v = weeklyValue(g.stats, stat);
              const h = v == null ? 0 : (v / max) * 100;
              const over = line != null && v != null && v > line;
              return (
                <div
                  key={`${g.season}-${g.week}-${i}`}
                  title={v == null ? "no stat" : `${g.season} wk${g.week}: ${v}`}
                  className={`min-w-0 flex-1 rounded-sm ${v == null ? "bg-border" : over ? "bg-edge-pos" : "bg-edge-neg"}`}
                  style={{ height: `${Math.max(4, h)}%` }}
                />
              );
            })
        )}
      </div>
    </section>
  );
}
