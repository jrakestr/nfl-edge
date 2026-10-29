import { signed } from "@/lib/edge";

export const dash = "—";

export function money(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return dash;
  return `$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function signedMoney(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return dash;
  if (Object.is(n, -0) || n === 0) return `$0${digits > 0 ? `.${"0".repeat(digits)}` : ""}`;
  const sign = n > 0 ? "+" : "−";
  return `${sign}${money(Math.abs(n), digits)}`;
}

export function fixedNum(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return dash;
  return n.toFixed(digits);
}

export function signedFixedNum(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return dash;
  return signed(n, digits);
}
