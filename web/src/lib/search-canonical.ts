/** Stable query comparison: key order from delete+set must not look like a change. */
export function canonicalSearch(sp: URLSearchParams | string): string {
  const p = typeof sp === "string" ? new URLSearchParams(sp) : new URLSearchParams(sp.toString());
  const keys = [...new Set(p.keys())].sort();
  const out = new URLSearchParams();
  for (const k of keys) {
    for (const v of p.getAll(k).sort()) out.append(k, v);
  }
  return out.toString();
}
