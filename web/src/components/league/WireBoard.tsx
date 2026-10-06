import { EmptyState } from "@/components/EmptyState";
import { Delta } from "@/components/league/Delta";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { shortStamp } from "@/lib/format";
import {
  availabilityLabel,
  espnStatusLabel,
  slotLabel,
  sortAvailable,
  waiverSuggestions,
  type AvailablePlayer,
  type StarterProj,
} from "@/lib/league";

export type WireBundle = {
  week: number | null;
  runId: string | null;
  available: AvailablePlayer[];
  starters: StarterProj[];
};

function num(n: number | null): string {
  return n == null ? "—" : n.toFixed(1);
}

function PlayerCell({ row }: { row: AvailablePlayer }) {
  const status = espnStatusLabel(row.injury_status);
  return (
    <TableCell className="t-body">
      <span className="font-semibold">{row.player}</span>{" "}
      <span className="t-caption">
        {[row.position, row.nfl_team, status].filter(Boolean).join(" ")}
      </span>
    </TableCell>
  );
}

/** Adds that beat a starter, then the full pool. Our PPR is the rank; DK is a column. */
export function WireBoard({ bundle, pool = true }: { bundle: WireBundle; pool?: boolean }) {
  if (bundle.available.length === 0) {
    return (
      <EmptyState title="No available players stored">
        Run nfl-edge ingest espn-league to load the waiver wire and free agents.
      </EmptyState>
    );
  }
  const suggestions = bundle.runId ? waiverSuggestions(bundle.available, bundle.starters) : [];
  const pulled = bundle.available[0]!.pulled_at;
  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2" aria-label="Waiver suggestions">
        <h2 className="t-body font-semibold">Suggestions</h2>
        {bundle.runId == null ? (
          <EmptyState title={`No complete simulation for week ${bundle.week}`}>
            Our points stay blank until that week has a full run. ESPN projections are not used.
          </EmptyState>
        ) : suggestions.length === 0 ? (
          <EmptyState title="No available player beats a starter">
            Compared on PPR mean against your current starters.
          </EmptyState>
        ) : (
          <div className="card overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow className="hover:bg-transparent">
                  {["Add", "Replaces", "Gap", "Our PPR", "DK"].map((h, i) => (
                    <TableHead key={h} className={`t-colhead text-muted-foreground ${i >= 2 ? "text-right" : ""}`}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {suggestions.map((s) => (
                  <TableRow key={s.add.espn_player_id}>
                    <PlayerCell row={s.add} />
                    <TableCell className="t-body">
                      {s.replace.player}{" "}
                      <span className="t-caption">{slotLabel(s.replace.slot)}</span>
                    </TableCell>
                    <TableCell className="t-body text-right"><Delta value={s.gap} /></TableCell>
                    <TableCell className="t-body tnum text-right">{num(s.add.ppr)}</TableCell>
                    <TableCell className="t-body tnum text-right">{num(s.add.dk)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <p className="t-caption">
          A suggestion beats your lowest starter at that position, or the flex when the flex is lower.
          The gap is our PPR mean. DK is the same run, shown beside it. Pulled {shortStamp(pulled)} ET.
        </p>
      </section>
      {pool ? <WirePool rows={bundle.available} /> : null}
    </div>
  );
}

function WirePool({ rows }: { rows: AvailablePlayer[] }) {
  const sorted = sortAvailable(rows);
  return (
    <section className="flex flex-col gap-2" aria-label="Available players">
      <h2 className="t-body font-semibold">Available</h2>
      <div className="card overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow className="hover:bg-transparent">
              {["Player", "Availability", "Our PPR", "DK"].map((h, i) => (
                <TableHead key={h} className={`t-colhead text-muted-foreground ${i >= 2 ? "text-right" : ""}`}>{h}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((r) => (
              <TableRow key={r.espn_player_id}>
                <PlayerCell row={r} />
                <TableCell className="t-body">
                  {availabilityLabel(r.availability)}
                  {r.on_bye ? <span className="t-caption"> Bye</span> : null}
                  {r.waiver_at ? <span className="t-caption"> {shortStamp(r.waiver_at)} ET</span> : null}
                </TableCell>
                <TableCell className="t-body tnum text-right">{num(r.ppr)}</TableCell>
                <TableCell className="t-body tnum text-right">{num(r.dk)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="t-caption">Sorted by our PPR mean. A player with no matching id, or no complete run, is blank and sorts last.</p>
    </section>
  );
}
