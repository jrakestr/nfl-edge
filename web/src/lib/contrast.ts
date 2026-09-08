/** WCAG 2.1 relative luminance and contrast. Hex only; tests are the spec. */

export const TOKENS = {
  background: "#F4F5F7",
  card: "#FFFFFF",
  muted: "#FAFBFC",
  accent: "#F7F8FA",
  foreground: "#111318",
  mutedForeground: "#5B6270",
  dim: "#A0A6B1",
  edgePos: "#0B7A4C",
  edgePosTint: "#E5F6EE",
  edgeNeg: "#B8342A",
  edgeNegTint: "#FCE9E6",
  warn: "#9A5A00",
  line: "#1F56D9",
  lineTint: "#EEF3FF",
} as const;

export type TokenHex = (typeof TOKENS)[keyof typeof TOKENS];

const AA = 4.5;

export function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) throw new Error(`expected #rrggbb, got ${hex}`);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export function passesAA(fg: string, bg: string, min = AA): boolean {
  return contrastRatio(fg, bg) >= min;
}

/** Mix fg over bg at opacity 0–1 (used to reject 70% edge color). */
export function blend(fg: string, bg: string, opacity: number): string {
  const [fr, fgG, fb] = parseHex(fg);
  const [br, bgG, bb] = parseHex(bg);
  const mix = (a: number, b: number) => Math.round(a * opacity + b * (1 - opacity));
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(mix(fr, br))}${hex(mix(fgG, bgG))}${hex(mix(fb, bb))}`;
}

export const SURFACES = {
  background: TOKENS.background,
  card: TOKENS.card,
  muted: TOKENS.muted,
  accent: TOKENS.accent,
} as const;

/** Text roles that a person must be able to read. --dim is not in this list. */
export const READABLE: Record<string, string> = {
  foreground: TOKENS.foreground,
  mutedForeground: TOKENS.mutedForeground,
  edgePos: TOKENS.edgePos,
  edgeNeg: TOKENS.edgeNeg,
  warn: TOKENS.warn,
  line: TOKENS.line,
};

export const CLASS_TO_FG: Record<string, string> = {
  "text-foreground": TOKENS.foreground,
  "text-muted-foreground": TOKENS.mutedForeground,
  "text-dim": TOKENS.dim,
  "text-edge-pos": TOKENS.edgePos,
  "text-edge-neg": TOKENS.edgeNeg,
  "text-edge-flat": TOKENS.mutedForeground,
  "text-warn": TOKENS.warn,
  "text-line": TOKENS.line,
};

export const CLASS_TO_BG: Record<string, string> = {
  "bg-background": TOKENS.background,
  "bg-card": TOKENS.card,
  "bg-muted": TOKENS.muted,
  "bg-accent": TOKENS.accent,
  "bg-edge-pos-tint": TOKENS.edgePosTint,
  "bg-edge-neg-tint": TOKENS.edgeNegTint,
  "bg-line-tint": TOKENS.lineTint,
  card: TOKENS.card,
};

export function fgFromClass(className: string): string | null {
  const parts = className.split(/\s+/);
  for (const p of parts) {
    if (CLASS_TO_FG[p]) return CLASS_TO_FG[p];
  }
  if (parts.includes("t-caption") || parts.includes("t-colhead")) return TOKENS.mutedForeground;
  if (parts.includes("t-body") || parts.includes("t-title") || parts.includes("t-tile") || parts.includes("t-sentence")) {
    return TOKENS.foreground;
  }
  return null;
}

export function bgFromClass(className: string): string | null {
  const parts = className.split(/\s+/);
  for (const p of parts) {
    if (CLASS_TO_BG[p]) return CLASS_TO_BG[p];
  }
  return null;
}

export function nearestBg(el: Element, fallback = TOKENS.card): string {
  let n: Element | null = el;
  while (n) {
    const cls = typeof n.className === "string" ? n.className : "";
    const bg = bgFromClass(cls);
    if (bg) return bg;
    n = n.parentElement;
  }
  return fallback;
}

export function assertReadable(fg: string, bg: string, label: string): void {
  const ratio = contrastRatio(fg, bg);
  if (ratio < AA) {
    throw new Error(`${label}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1 (need ${AA}:1)`);
  }
}
