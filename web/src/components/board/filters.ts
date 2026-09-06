import { FLAT, maxEdge } from "@/lib/edge";
import type { Slot } from "@/lib/teams";
import type { BoardRow } from "@/lib/types";

export type SlotFilter = "all" | "early" | "late" | "primetime";

export type Filters = {
  /** Minimum |max edge| as a fraction (0.03 = 3%). */
  minEdge: number;
  hideFlat: boolean;
  slot: SlotFilter;
};

export const DEFAULT_FILTERS: Filters = { minEdge: 0, hideFlat: false, slot: "all" };

/** URL ↔ filters. `min` is in whole percent, `flat=0` hides flat rows, `slot` is the kickoff slot. */
export function parseFilters(sp: Record<string, string | string[] | undefined>): Filters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  const min = Number(one("min"));
  const slot = one("slot");
  return {
    minEdge: Number.isFinite(min) && min > 0 ? Math.min(min, 50) / 100 : 0,
    hideFlat: one("flat") === "0",
    slot: slot === "early" || slot === "late" || slot === "primetime" ? slot : "all",
  };
}

export function filtersToParams(f: Filters, base: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base.toString());
  if (f.minEdge > 0) p.set("min", String(Math.round(f.minEdge * 100)));
  else p.delete("min");
  if (f.hideFlat) p.set("flat", "0");
  else p.delete("flat");
  if (f.slot !== "all") p.set("slot", f.slot);
  else p.delete("slot");
  return p;
}

export function applyFilters(rows: BoardRow[], f: Filters, slotOf: (r: BoardRow) => Slot): BoardRow[] {
  return rows.filter((r) => {
    const m = maxEdge(r);
    if (f.hideFlat && m < FLAT) return false;
    if (f.minEdge > 0 && m < f.minEdge) return false;
    if (f.slot !== "all" && slotOf(r) !== f.slot) return false;
    return true;
  });
}
