import { PositionPill } from "@/components/ui/PositionPill";
import { MetricLabel } from "@/lib/icons";
import type { DrawerPlayer } from "@/lib/queries/players";

export function PlayerProjections({ players }: { players: readonly DrawerPlayer[] }) {
  return (
    <section aria-label="Top player projections" className="flex flex-col gap-2">
      <h3 className="t-colhead text-muted-foreground">
        <MetricLabel metric="projection">Top-10 player projections</MetricLabel>
      </h3>
      {players.length === 0 ? (
        <p className="t-caption">No player projections on this run.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {players.map((p) => (
            <li key={p.player_id} className="flex items-center justify-between gap-2">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <PositionPill position={p.position} />
                <span className="truncate font-semibold text-foreground">{p.display_name}</span>
              </span>
              <span className="tnum font-semibold text-foreground">
                {p.fpts_dk_mean != null ? p.fpts_dk_mean.toFixed(1) : "—"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
