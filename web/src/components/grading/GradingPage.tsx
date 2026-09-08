"use client";

import { DataTable } from "@/components/ui/DataTable";
import { MetricLabel, type Metric } from "@/lib/icons";

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

type GradeRow = { id: string };

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
      <DataTable
        data={[] as GradeRow[]}
        getRowId={(r) => r.id}
        empty="No graded weeks yet"
        ariaLabel="Graded edges"
        columns={[
          { id: "matchup", header: "Matchup", cell: () => null },
          { id: "spread", header: "Spread", align: "right", cell: () => null },
          { id: "total", header: "Total", align: "right", cell: () => null },
          { id: "ml", header: "Home wins", align: "right", cell: () => null },
          { id: "cover", header: "Covers the book line", align: "right", cell: () => null },
          { id: "market", header: "Market", sortable: false, cell: () => null },
          { id: "actual", header: "Actual", align: "right", cell: () => null },
        ]}
      />
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
