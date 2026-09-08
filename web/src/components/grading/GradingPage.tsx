import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MetricLabel, type Metric } from "@/lib/icons";

const COLS = [
  "Matchup",
  "Spread",
  "Total",
  "Home wins",
  "Covers the book line",
  "Market",
  "Actual",
] as const;

function Tile({
  metric,
  label,
  value,
  sub,
}: {
  metric?: Metric;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="card flex flex-col gap-1 p-4" role="listitem">
      <span className="t-colhead text-muted-foreground">
        {metric ? <MetricLabel metric={metric}>{label}</MetricLabel> : label}
      </span>
      <span className="t-tile tnum">{value}</span>
      {sub ? <span className="t-caption">{sub}</span> : null}
    </div>
  );
}

/** Edge-board table plus Actual. Track record and calibration fill in with grade-web. */
export function GradingPage() {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="t-title">Grading</h1>
        <p className="mt-1 t-caption">
          Same table as the Edge board, with Actual after the games. Fills in with grade-web from
          model.results. Flat ROI is the headline until ten graded weeks.
        </p>
      </header>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4" role="list" aria-label="Track record">
        <Tile label="Record" value="—" sub="No graded weeks yet" />
        <Tile metric="roi" label="Flat ROI" value="—" sub="Headline until ten weeks" />
        <Tile label="Sides" value="—" />
        <Tile label="Totals" value="—" />
      </div>
      <section className="card overflow-x-auto" aria-label="Graded edges">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow className="hover:bg-transparent">
              {COLS.map((c) => (
                <TableHead key={c} className={c === "Matchup" || c === "Market" ? "t-colhead text-muted-foreground" : "t-colhead text-right text-muted-foreground"}>
                  {c}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell colSpan={COLS.length} className="py-6 text-center t-caption">
                No graded weeks yet
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>
      <section className="card p-4">
        <h2 className="t-body font-semibold">Calibration</h2>
        <div className="relative mt-3 h-40 rounded-md bg-muted">
          <p className="absolute inset-0 flex items-center justify-center t-caption">
            Chart fills in with grade-web
          </p>
        </div>
        <p className="mt-2 t-caption">
          Monotone against the close is a season-long target, not a sim build gate.
        </p>
      </section>
    </div>
  );
}
