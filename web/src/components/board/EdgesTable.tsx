"use client";

import { useMemo } from "react";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { direction, intensity, pct, price, signedPct } from "@/lib/edge";
import type { BoardRow, EdgeSide } from "@/lib/types";
import { EdgeDiff } from "./EdgeCell";

export const EDGE_KEYS = [
  "spread_home",
  "spread_away",
  "total_over",
  "total_under",
  "ml_home",
  "ml_away",
] as const satisfies readonly (keyof BoardRow["edges"])[];

const SIDE_LABEL: Record<keyof BoardRow["edges"], (row: BoardRow) => string> = {
  spread_home: (row) => `${row.home} spread`,
  spread_away: (row) => `${row.away} spread`,
  total_over: () => "Over",
  total_under: () => "Under",
  ml_home: (row) => `${row.home} moneyline`,
  ml_away: (row) => `${row.away} moneyline`,
};

export type EdgeTableRow = {
  id: keyof BoardRow["edges"];
  label: string;
  edge: EdgeSide | null;
};

const COLUMNS: DataColumn<EdgeTableRow>[] = [
  {
    id: "side",
    header: "Side",
    className: "w-[28%] truncate",
    headClassName: "w-[28%]",
    sortValue: (row) => row.label,
    cell: (row) => <span className="t-body truncate">{row.label}</span>,
  },
  {
    id: "model",
    header: "Model",
    align: "right",
    sortValue: (row) => row.edge?.model_prob ?? -Infinity,
    cell: (row) => <span className="tnum font-semibold">{row.edge ? pct(row.edge.model_prob) : "—"}</span>,
  },
  {
    id: "market",
    header: "Market",
    align: "right",
    sortValue: (row) => row.edge?.market_prob ?? -Infinity,
    cell: (row) => <span className="tnum font-semibold text-line">{row.edge ? pct(row.edge.market_prob) : "—"}</span>,
  },
  {
    id: "edge",
    header: "Edge",
    metric: "edge",
    align: "right",
    // Missing edges coerce to -Infinity so null sides always sort last under descending Edge sort.
    sortValue: (row) => row.edge?.edge ?? -Infinity,
    cell: (row) =>
      row.edge ? (
        <EdgeDiff dir={direction(row.edge.edge)} inten={intensity(row.edge.edge)}>
          {signedPct(row.edge.edge)}
        </EdgeDiff>
      ) : (
        "—"
      ),
  },
  {
    id: "price",
    header: "Price",
    align: "right",
    sortValue: (row) => row.edge?.price ?? -Infinity,
    cell: (row) => <span className="tnum font-semibold text-foreground">{row.edge ? price(row.edge.price) : "—"}</span>,
  },
  {
    id: "kelly",
    header: "¼ Kelly",
    align: "right",
    // kelly_fraction is non-nullable on EdgeSide (validated at the BoardRow boundary in edge.ts / types.ts).
    sortValue: (row) => row.edge?.kelly_fraction ?? -Infinity,
    cell: (row) => (
      <span className="tnum font-semibold text-foreground">
        {row.edge ? `${(row.edge.kelly_fraction * 100).toFixed(1)}%` : "—"}
      </span>
    ),
  },
];

export function EdgesTable({ row }: { row: BoardRow }) {
  const data = useMemo<EdgeTableRow[]>(
    () =>
      EDGE_KEYS.map((id) => ({
        id,
        label: SIDE_LABEL[id](row),
        edge: row.edges[id],
      })),
    [row],
  );

  return (
    <section aria-label="Edges">
      <h3 className="t-colhead mb-2 text-muted-foreground">Model vs market at the newest line</h3>
      <DataTable
        data={data}
        getRowId={(item) => item.id}
        empty="—"
        syncUrl={false}
        defaultSort={{ id: "edge", dir: "desc" }}
        tableClassName="w-full table-fixed"
        rowProps={() => ({ className: "h-10" })}
        columns={COLUMNS}
      />
    </section>
  );
}
