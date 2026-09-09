/** Own% v1 — same blend as src/nfl_edge/outputs/dfs_export.py. */

export function ownPctV1(salaryRank: number, projRank: number, n: number): number {
  if (n <= 0) return 0.5;
  const invS = (n - salaryRank + 1) / n;
  const invP = (n - projRank + 1) / n;
  return 0.5 + 29.5 * (0.5 * invS + 0.5 * invP);
}

export function ranks(values: number[]): number[] {
  const order = [...values.keys()].sort((a, b) => values[b]! - values[a]!);
  const out = Array(values.length).fill(0);
  order.forEach((i, r) => {
    out[i] = r + 1;
  });
  return out;
}

export function valuePerK(fpts: number | null | undefined, salary: number | null | undefined): number | null {
  if (fpts == null || salary == null || salary <= 0) return null;
  return fpts / (salary / 1000);
}
