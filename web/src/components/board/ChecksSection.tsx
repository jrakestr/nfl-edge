import { formatFailedLine } from "@/lib/check-display";
import { plural } from "@/lib/format";
import type { BoardRow, GameChecks } from "@/lib/types";

export function ChecksSection({
  checks,
  row,
  runCreatedAt,
}: {
  checks: GameChecks | null;
  row: Pick<BoardRow, "away" | "home">;
  runCreatedAt?: string | null;
}) {
  return (
    <section aria-label="Checks" className="flex flex-col gap-1">
      <h3 className="t-colhead text-muted-foreground">Checks</h3>
      {checks ? (
        <>
          <p className="t-body text-muted-foreground">
            {plural(checks.invariants, "invariant")}, {plural(checks.warnings, "warning")}
            {checks.failedRows.length === 0 ? " · all passed" : ""}
          </p>
          {checks.failedRows.length === 0 ? null : (
            <ul className="flex flex-col gap-0.5">
              {/* sim_checks writes at most one row per (game_id, check_name, team). */}
              {checks.failedRows.map((failedRow) => (
                <li key={`${failedRow.check_name}-${failedRow.team ?? ""}`} className="t-body text-foreground">
                  {failedRow.check_name}
                  {" · "}
                  {formatFailedLine(row.away, row.home, failedRow, runCreatedAt)}
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="t-body text-muted-foreground">No game-level checks recorded.</p>
      )}
    </section>
  );
}
