import { normalizePosition } from "@/components/ui/PositionPill";

/** Rank 1 = highest non-null metric among rows sharing a real position. */
export function positionRanks<T>(
  rows: T[],
  getPos: (row: T) => string | null | undefined,
  getVal: (row: T) => number | null | undefined,
): (number | null)[] {
  const out: (number | null)[] = rows.map(() => null);
  const buckets = new Map<string, { i: number; val: number }[]>();
  rows.forEach((row, i) => {
    const pos = normalizePosition(getPos(row));
    const val = getVal(row);
    if (!pos || val == null || !Number.isFinite(val)) return;
    const list = buckets.get(pos) ?? [];
    list.push({ i, val });
    buckets.set(pos, list);
  });
  for (const list of buckets.values()) {
    list.sort((a, b) => b.val - a.val);
    list.forEach((row, rank) => {
      out[row.i] = rank + 1;
    });
  }
  return out;
}
