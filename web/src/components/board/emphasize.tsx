import type { ReactNode } from "react";

/**
 * Bold the key facts in a verdict sentence without parsing it: percentages, "by N points",
 * signed lines (−3.5 / +3.5 / PK), prices in parentheses, "Over/Under N", and point totals
 * like "43.0 total points". The sentence text itself is never changed.
 */
const PATTERN =
  /([−+-]?\d+(?:\.\d+)?%|by \d+(?:\.\d+)?(?: points?)?|\b(?:Over|Under) \d+(?:\.\d+)?|\d+(?:\.\d+)? total points|[−+-]\d+(?:\.\d+)?(?![\d.]\d)|\d{1,3}(?:,\d{3})+)/g;

export function emphasize(sentence: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of sentence.matchAll(PATTERN)) {
    const start = m.index ?? 0;
    if (start > last) out.push(sentence.slice(last, start));
    out.push(<b key={i++}>{m[0]}</b>);
    last = start + m[0].length;
  }
  if (last < sentence.length) out.push(sentence.slice(last));
  return out;
}
