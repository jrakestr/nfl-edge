"use client";

import { useState } from "react";
import { TransactionsTable } from "@/components/league/TransactionsTable";
import { defaultTxnWeek, transactionWeekTabs, type TxnGroup } from "@/lib/league";
import { cn } from "@/lib/utils";

/** Transactions split by week. The latest week is selected; draft and undated trades are their own tabs. */
export function TxnWeekTabs({ weeks, groups }: { weeks: number[]; groups: TxnGroup[] }) {
  const tabs = transactionWeekTabs(groups, weeks);
  const [key, setKey] = useState(() => defaultTxnWeek(tabs));
  const selected = tabs.find((t) => t.key === key) ?? tabs[0];
  if (!selected) return null;
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Weeks" className="flex flex-wrap items-center gap-1 border-b border-border">
        {tabs.map((t) => {
          const active = t.key === selected.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setKey(t.key)}
              className={cn(
                "-mb-px inline-flex h-9 items-center border-b-2 px-3 t-body",
                active
                  ? "border-foreground font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div role="tabpanel">
        {selected.groups.length === 0 ? (
          <p className="t-sentence text-muted-foreground">No transactions this week.</p>
        ) : (
          <TransactionsTable groups={selected.groups} total={selected.groups.length} />
        )}
      </div>
    </div>
  );
}
