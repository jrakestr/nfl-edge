import { Delta } from "@/components/league/Delta";
import { TeamLink } from "@/components/league/TeamLink";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { shortStamp } from "@/lib/format";
import {
  asOfCaption,
  viewerRow,
  fpTiming,
  MISS_POINTS,
  practiceLine,
  slotLabel,
  starterMisses,
  type PlayerCheckRow,
  type StarterRow,
} from "@/lib/league";

function fpCell(r: StarterRow) {
  if (!r.fp_matched) {
    return <span className="text-muted-foreground">Not on the FantasyPros report</span>;
  }
  const practice = practiceLine(r.practice_1, r.practice_2, r.practice_3);
  const chance = r.probability_of_playing != null ? `${Math.round(r.probability_of_playing * 100)}% to play` : null;
  return (
    <span className="flex flex-col">
      <span className="font-semibold text-foreground">{r.fp_status ?? "Listed, no status"}</span>
      <span className="t-caption">{[chance, practice ? `practice ${practice}` : null].filter(Boolean).join(", ") || "no practice detail"}</span>
      <span className="t-caption">{fpTiming(r.known_before_kickoff)}</span>
    </span>
  );
}

const DIFF_MIN = 2;
const DIFF_ROWS = 8;

/**
 * Starters who scored well under their ESPN projection, each with what we knew before kickoff.
 * Our own status comes from snapshots taken before kickoff; where none exists the row says so.
 * FantasyPros is a second source: its report was pulled later, so a status counts as known before
 * kickoff only when its update date proves it. Where ESPN and FantasyPros score the same player-week
 * differently, the points check below lists the largest gaps.
 */
export function StarterMisses({
  starters,
  checks,
  weekFinal,
  season,
}: {
  starters: StarterRow[];
  checks: PlayerCheckRow[];
  weekFinal: boolean;
  season: number;
}) {
  if (!weekFinal) {
    return (
      <p className="t-sentence text-muted-foreground">Starter misses appear when every game this week is final.</p>
    );
  }
  const misses = starterMisses(starters);
  const fetched = starters.map((s) => s.fp_fetched_at).filter((v): v is string => !!v).sort().at(-1) ?? null;
  const diffs = checks
    .filter((c) => c.comparable && c.diff != null && Math.abs(c.diff) >= DIFF_MIN)
    .slice(0, DIFF_ROWS);
  return (
    <div className="flex flex-col gap-4">
      {misses.length === 0 ? (
        <p className="t-sentence text-muted-foreground">
          No starter scored {MISS_POINTS} or more points under projection.
        </p>
      ) : (
        <section className="card overflow-x-auto" aria-label="Starter misses">
          <Table>
            <TableHeader className="bg-muted">
              <TableRow className="hover:bg-transparent">
                {["Team", "Player", "Slot", "Proj", "Actual", "Short", "ESPN status before kickoff", "FantasyPros", "FP pts"].map((h, i) => (
                  <TableHead key={h} className={`t-colhead text-muted-foreground ${i >= 3 && i <= 5 || i === 8 ? "text-right" : ""}`}>
                    {h}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {misses.map((r) => (
                <TableRow key={`${r.espn_team_id}:${r.player}:${r.slot}`} {...viewerRow(r.espn_team_id)}>
                  <TableCell className="t-body"><TeamLink id={r.espn_team_id} name={r.team} season={season} /></TableCell>
                  <TableCell className="t-body">
                    <span className="flex flex-col">
                      <span className="font-semibold">{r.player}</span>
                      <span className="t-caption">{[r.position, r.nfl_team].filter(Boolean).join(" ")}</span>
                    </span>
                  </TableCell>
                  <TableCell className="t-body">{slotLabel(r.slot)}</TableCell>
                  <TableCell className="t-body tnum text-right">{r.proj_pts!.toFixed(1)}</TableCell>
                  <TableCell className="t-body tnum text-right font-semibold">{r.actual_pts!.toFixed(1)}</TableCell>
                  <TableCell className="t-body tnum text-right"><Delta value={r.actual_pts! - r.proj_pts!} /></TableCell>
                  <TableCell className="t-body">{asOfCaption(r.snapshot_status, r.snapshot_pulled_at)}</TableCell>
                  <TableCell className="t-body">{fpCell(r)}</TableCell>
                  <TableCell className="t-body tnum text-right">{r.fp_points != null ? r.fp_points.toFixed(1) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}
      <p className="t-caption">
        {fetched
          ? `FantasyPros injury report pulled ${shortStamp(fetched)} ET, after the games. A status counts as known before kickoff only if its update date is on or before kickoff.`
          : "No FantasyPros injury report is stored for this week. Run nfl-edge fantasypros-injury-reports."}
      </p>
      {diffs.length > 0 ? (
        <section className="flex flex-col gap-2" aria-label="ESPN and FantasyPros points check">
          <h3 className="t-body font-semibold">Where ESPN and FantasyPros points differ</h3>
          <div className="card overflow-x-auto">
            <Table>
              <TableHeader className="bg-muted">
                <TableRow className="hover:bg-transparent">
                  {["Team", "Player", "ESPN pts", "FP pts", "ESPN minus FP"].map((h, i) => (
                    <TableHead key={h} className={`t-colhead text-muted-foreground ${i >= 2 ? "text-right" : ""}`}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {diffs.map((c) => (
                  <TableRow key={`${c.espn_team_id}:${c.player}:${c.slot}`} {...viewerRow(c.espn_team_id)}>
                    <TableCell className="t-body"><TeamLink id={c.espn_team_id} name={c.team} season={season} /></TableCell>
                    <TableCell className="t-body">{c.player}</TableCell>
                    <TableCell className="t-body tnum text-right">{c.espn_actual!.toFixed(1)}</TableCell>
                    <TableCell className="t-body tnum text-right">{c.fp_points!.toFixed(1)}</TableCell>
                    <TableCell className="t-body tnum text-right"><Delta value={c.diff} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
