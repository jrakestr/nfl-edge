"use client";

import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { SIZE_BUCKETS, type BucketRollup, type SizeBucket, type TopFinish } from "@/lib/contest-history";
import { pct, signedPct } from "@/lib/edge";
import { dash, fixedNum, money, signedMoney } from "./format";

const SIZE_ORDER = new Map<string, number>(SIZE_BUCKETS.map((b, i) => [b, i]));

const SIZE_COLUMNS: DataColumn<BucketRollup<SizeBucket>>[] = [
  {
    id: "bucket",
    header: "Field size",
    sortValue: (r) => SIZE_ORDER.get(r.bucket) ?? 99,
    cell: (r) => r.bucket,
  },
  {
    id: "entries",
    header: "Entries",
    align: "right",
    sortValue: (r) => r.entries,
    cell: (r) => r.entries.toLocaleString("en-US"),
    className: "tnum",
  },
  {
    id: "fees",
    header: "Fees",
    align: "right",
    sortValue: (r) => r.fees,
    cell: (r) => money(r.fees),
    className: "tnum",
  },
  {
    id: "winnings",
    header: "Won",
    align: "right",
    sortValue: (r) => r.winnings,
    cell: (r) => money(r.winnings),
    className: "tnum",
  },
  {
    id: "net",
    header: "Net",
    align: "right",
    sortValue: (r) => r.net,
    cell: (r) => (
      <span className={r.net > 0 ? "text-edge-pos font-semibold" : r.net < 0 ? "text-edge-neg font-semibold" : ""}>
        {signedMoney(r.net)}
      </span>
    ),
    className: "tnum",
  },
  {
    id: "cashRate",
    header: "Cash %",
    align: "right",
    sortValue: (r) => r.cashRate,
    cell: (r) => (r.cashRate == null ? dash : pct(r.cashRate, 1)),
    className: "tnum",
  },
  {
    id: "roi",
    header: "ROI",
    align: "right",
    sortValue: (r) => r.roi,
    cell: (r) => (r.roi == null ? dash : signedPct(r.roi, 1)),
    className: "tnum",
  },
];

const TOP_FINISH_COLUMNS: DataColumn<TopFinish>[] = [
  {
    id: "date",
    header: "Date",
    sortValue: (r) => r.date ?? "",
    cell: (r) => r.date ?? dash,
    className: "tnum",
  },
  {
    id: "entryName",
    header: "Contest",
    sortValue: (r) => r.entryName,
    cell: (r) => r.entryName,
  },
  {
    id: "entryFee",
    header: "Fee",
    align: "right",
    sortValue: (r) => r.entryFee,
    cell: (r) => money(r.entryFee),
    className: "tnum",
  },
  {
    id: "contestEntries",
    header: "Field",
    align: "right",
    sortValue: (r) => r.contestEntries,
    cell: (r) => (r.contestEntries == null ? dash : r.contestEntries.toLocaleString("en-US")),
    className: "tnum",
  },
  {
    id: "place",
    header: "Place",
    align: "right",
    sortValue: (r) => r.place,
    cell: (r) => (r.place == null ? dash : r.place.toLocaleString("en-US")),
    className: "tnum",
  },
  {
    id: "points",
    header: "Points",
    align: "right",
    sortValue: (r) => r.points,
    cell: (r) => fixedNum(r.points, 2),
    className: "tnum",
  },
  {
    id: "winnings",
    header: "Won",
    align: "right",
    sortValue: (r) => r.winnings,
    cell: (r) => <span className="font-semibold text-foreground">{money(r.winnings)}</span>,
    className: "tnum",
  },
];

export function HistoryTables({
  bySize,
  topFinishes,
}: {
  bySize: readonly BucketRollup<SizeBucket>[];
  topFinishes: readonly TopFinish[];
}) {
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <div className="flex flex-col gap-2">
        <h2 className="t-sentence font-semibold">By contest field size</h2>
        <DataTable
          data={bySize.filter((b) => b.entries > 0)}
          columns={SIZE_COLUMNS}
          getRowId={(r) => r.bucket}
          empty="No entries."
          ariaLabel="By contest field size"
          syncUrl={false}
          defaultSort={{ id: "bucket", dir: "asc" }}
        />
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="t-sentence font-semibold">Top finishes</h2>
        <DataTable
          data={[...topFinishes]}
          columns={TOP_FINISH_COLUMNS}
          getRowId={(r) => `${r.date ?? "na"}-${r.entryName}-${r.place ?? "na"}-${r.points ?? "na"}-${r.winnings}`}
          empty="No winning finishes."
          ariaLabel="Top finishes"
          syncUrl={false}
          defaultSort={{ id: "winnings", dir: "desc" }}
        />
      </div>
    </div>
  );
}
