/** Extract numerals and decide whether each can be tied to a payload value. */

const NUM_RE = /-?\d+(?:\.\d+)?/g;
const SNAKE_RE = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/;

export function extractNumerals(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(NUM_RE)) {
    const n = Number(m[0]);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

export function payloadNumbers(value: unknown, acc: number[] = []): number[] {
  if (typeof value === "number" && Number.isFinite(value)) {
    acc.push(value);
    return acc;
  }
  if (Array.isArray(value)) {
    for (const v of value) payloadNumbers(v, acc);
    return acc;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) payloadNumbers(v, acc);
  }
  return acc;
}

function decimalPlaces(n: number): number {
  const s = String(n);
  const i = s.indexOf(".");
  return i < 0 ? 0 : s.length - i - 1;
}

function roundTo(n: number, places: number): number {
  const f = 10 ** places;
  return Math.round(n * f) / f;
}

/** True if n restates v: same displayed precision, integer points, or (factor-1)*100. */
export function numeralMatches(n: number, v: number): boolean {
  if (Math.abs(n - v) <= 1e-6 * Math.max(1, Math.abs(v))) return true;
  if (Math.abs(n - v) <= 0.05) return true;
  const places = decimalPlaces(n);
  if (roundTo(v, places) === n) return true;
  if (places === 0 && Math.abs(Math.round(v) - n) < 1e-9 && Math.abs(v - n) < 1) return true;
  if (v > 0.8 && v < 1.5) {
    const pct = (v - 1) * 100;
    if (roundTo(pct, places) === n) return true;
    if (places === 0 && Math.abs(Math.round(pct) - n) <= 1) return true;
  }
  return false;
}

/** Ratios and percent-diffs of payload numbers, plus (factor − 1) as a percent. */
export function derivedNumbers(values: number[]): number[] {
  const extra: number[] = [];
  for (const v of values) {
    if (v > 0.8 && v < 1.5) extra.push((v - 1) * 100);
  }
  for (let i = 0; i < values.length; i++) {
    for (let j = 0; j < values.length; j++) {
      if (i === j) continue;
      const a = values[i];
      const b = values[j];
      if (b === 0) continue;
      extra.push(a / b);
      extra.push((a / b) * 100);
      extra.push(((a - b) / b) * 100);
      extra.push(a - b);
    }
  }
  return extra.filter((x) => Number.isFinite(x));
}

export function numeralsAllowed(text: string, payload: unknown): { ok: true } | { ok: false; bad: number[] } {
  const values = payloadNumbers(payload);
  const pool = values.concat(derivedNumbers(values));
  const bad = extractNumerals(text).filter((n) => !pool.some((v) => numeralMatches(n, v)));
  return bad.length ? { ok: false, bad } : { ok: true };
}

export function hasSnakeIdentifier(text: string): boolean {
  return SNAKE_RE.test(text);
}
