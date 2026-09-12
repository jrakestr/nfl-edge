import { StackChip, type Stack } from "./StackChip";
import { PositionPill } from "@/components/ui/PositionPill";
import { pct as fmtPct } from "@/lib/edge";
import { MetricLabel } from "@/lib/icons";
import { REBUILD_PENDING } from "@/lib/injury-status";
import type { DfsLineup } from "@/lib/types";

const SLOT_ORDER = ["QB", "RB", "RB2", "WR", "WR2", "WR3", "TE", "FLEX", "DST"] as const;
const SHOWDOWN_ORDER = ["CPT", "FLEX", "FLEX2", "FLEX3", "FLEX4", "FLEX5"] as const;

const NAME_SUFFIX = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);
const COMPOUND_LAST = new Set(["st", "de", "la", "van", "von"]);

/** Display-only last name for chips. Shared cases: tests/fixtures/last_name_cases.json. */
export function lastName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return name;
  let end = parts.length - 1;
  while (end > 0 && NAME_SUFFIX.has(parts[end].replaceAll(".", "").toLowerCase())) {
    end -= 1;
  }
  const stem = parts[end].replaceAll(".", "").toLowerCase();
  if (end > 0 && COMPOUND_LAST.has(parts[end - 1].replaceAll(".", "").toLowerCase())) {
    return `${parts[end - 1]} ${parts[end]}`;
  }
  if (NAME_SUFFIX.has(stem)) return name;
  return parts[end] ?? name;
}

export function stacksFromPlayers(
  players: DfsLineup["players"],
  teams: Record<string, string>,
): Stack[] {
  const counts = new Map<string, number>();
  for (const p of players) {
    const team = teams[p.name.toLowerCase()];
    if (!team) continue;
    counts.set(team, (counts.get(team) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([team, count]) => ({ team, count }));
}

export function LineupCard({
  lineup,
  teams = {},
  positions = {},
  selected = false,
  onToggle,
  slate,
  staleDkIds = new Set(),
  ownershipSum,
}: {
  lineup: DfsLineup;
  teams?: Record<string, string>;
  positions?: Record<string, string>;
  selected?: boolean;
  onToggle?: () => void;
  slate?: string;
  staleDkIds?: Set<string>;
  ownershipSum?: number | null;
}) {
  const bySlot = new Map(lineup.players.map((p) => [p.slot, p]));
  const stacks = stacksFromPlayers(lineup.players, teams);
  const showdown = slate === "showdown" || lineup.players.some((p) => p.slot === "CPT");
  const order = showdown ? SHOWDOWN_ORDER : SLOT_ORDER;
  const stale = lineup.players.some((p) => p.dk_id != null && staleDkIds.has(p.dk_id));
  return (
    <article className="card flex flex-col gap-2 p-4" aria-label={`Lineup ${lineup.lineup_id}`}>
      <div className="flex items-start gap-3">
        {onToggle ? (
          <input
            type="checkbox"
            className="mt-2 size-4 shrink-0"
            checked={selected}
            onChange={onToggle}
            aria-label={`Select lineup ${lineup.lineup_id}`}
          />
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1">
            {order.map((slot) => {
              const p = bySlot.get(slot);
              const pos = p ? positions[p.name.toLowerCase()] : undefined;
              const label = p
                ? slot === "CPT"
                  ? `CPT ${lastName(p.name)}`
                  : lastName(p.name)
                : slot;
              return (
                <span
                  key={slot}
                  title={p?.name ?? slot}
                  className="inline-flex h-8 min-w-9 items-center justify-center gap-1 rounded-sm bg-muted px-1.5 t-body font-semibold text-foreground"
                >
                  {p ? <PositionPill position={pos} /> : null}
                  {label}
                </span>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3 t-caption">
            <MetricLabel metric="salary">
              Salary used{" "}
              <span className="tnum font-semibold text-foreground">
                {lineup.salary_used != null ? lineup.salary_used.toLocaleString("en-US") : "—"}
              </span>
            </MetricLabel>
            <MetricLabel metric="projection">
              Proj{" "}
              <span className="tnum font-semibold text-foreground">
                {lineup.proj_fpts != null ? lineup.proj_fpts.toFixed(1) : "—"}
              </span>
            </MetricLabel>
            {ownershipSum != null ? (
              <MetricLabel metric="ownership">
                Own{" "}
                <span className="tnum font-semibold text-foreground">
                  {fmtPct(ownershipSum, 1)}
                </span>
              </MetricLabel>
            ) : null}
            <MetricLabel metric="winPct">
              Win %{" "}
              <span className="tnum font-semibold text-foreground">
                {fmtPct(lineup.sim_win_pct, Math.abs((lineup.sim_win_pct ?? 0) * 100) < 1 ? 1 : 0)}
              </span>
            </MetricLabel>
            <MetricLabel metric="roi">
              ROI <span className="tnum font-semibold text-foreground">{fmtPct(lineup.sim_roi)}</span>
            </MetricLabel>
            {stacks.length ? stacks.map((s) => <StackChip key={s.team} {...s} />) : <StackChip />}
            {stale ? <span className="t-caption text-warn">{REBUILD_PENDING}</span> : null}
          </div>
        </div>
      </div>
    </article>
  );
}
