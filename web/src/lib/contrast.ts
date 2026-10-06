/** WCAG 2.1 relative luminance and contrast. Hex only; tests are the spec. */

export type TokenSet = {
  background: string;
  fieldCool: string;
  fieldMid: string;
  fieldWarm: string;
  card: string;
  /** Theme glass fill composited over the cool field stop. */
  glass: string;
  muted: string;
  accent: string;
  foreground: string;
  mutedForeground: string;
  posInk: string;
  border: string;
  borderSoft: string;
  edgePos: string;
  edgePosTint: string;
  edgeNeg: string;
  edgeNegTint: string;
  warn: string;
  line: string;
  lineTint: string;
  posQb: string;
  posQbTint: string;
  posRb: string;
  posRbTint: string;
  posWr: string;
  posWrTint: string;
  posTe: string;
  posTeTint: string;
  posDst: string;
  posDstTint: string;
};

export const LIGHT: TokenSet = {
  background: "#F4F5F7",
  fieldCool: "#E8ECF2",
  fieldMid: "#F4F5F7",
  fieldWarm: "#F3F1EC",
  card: "#FFFFFF",
  glass: "#F9FAFB",
  muted: "#FAFBFC",
  accent: "#F7F8FA",
  foreground: "#111318",
  mutedForeground: "#5B6270",
  posInk: "#FFFFFF",
  border: "#B8BCC4",
  borderSoft: "#E4E7EC",
  edgePos: "#0B7A4C",
  edgePosTint: "#E5F6EE",
  edgeNeg: "#B8342A",
  edgeNegTint: "#FCE9E6",
  warn: "#9A5A00",
  line: "#1F56D9",
  lineTint: "#EEF3FF",
  posQb: "#1F3D99",
  posQbTint: "#E4E8F5",
  posRb: "#2F6A14",
  posRbTint: "#E8EFE3",
  posWr: "#A31D4C",
  posWrTint: "#F6E6ED",
  posTe: "#7A14A8",
  posTeTint: "#F2E6F8",
  posDst: "#B84400",
  posDstTint: "#F9EFE8",
};

export const DARK: TokenSet = {
  background: "#12141A",
  fieldCool: "#0E1016",
  fieldMid: "#12141A",
  fieldWarm: "#16140F",
  card: "#1C1E26",
  glass: "#181A22",
  muted: "#2A2E38",
  accent: "#242832",
  foreground: "#F2F3F6",
  mutedForeground: "#A8AFBC",
  posInk: "#FFFFFF",
  border: "#4A5060",
  borderSoft: "#2E323C",
  edgePos: "#3DCC8A",
  edgePosTint: "#1A3D2E",
  edgeNeg: "#F07167",
  edgeNegTint: "#3D2422",
  warn: "#E8A040",
  line: "#7B9CFF",
  lineTint: "#1A2744",
  posQb: "#1F3D99",
  posQbTint: "#1A2040",
  posRb: "#2F6A14",
  posRbTint: "#1A2A14",
  posWr: "#A31D4C",
  posWrTint: "#3A1524",
  posTe: "#7A14A8",
  posTeTint: "#2A1540",
  posDst: "#B84400",
  posDstTint: "#3A2010",
};

/** Light map. Prefer LIGHT / DARK when the theme is known. */
export const TOKENS = LIGHT;

export type TokenHex = TokenSet[keyof TokenSet];

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

export function surfacesOf(t: TokenSet) {
  return {
    background: t.background,
    fieldCool: t.fieldCool,
    fieldWarm: t.fieldWarm,
    card: t.card,
    muted: t.muted,
    accent: t.accent,
    glass: t.glass,
  } as const;
}

/** Text roles a person must be able to read. Position fills are backgrounds; ink is --pos-ink. */
export function readableOf(t: TokenSet): Record<string, string> {
  return {
    foreground: t.foreground,
    mutedForeground: t.mutedForeground,
    edgePos: t.edgePos,
    edgeNeg: t.edgeNeg,
    warn: t.warn,
    line: t.line,
  };
}

export function classToFgOf(t: TokenSet): Record<string, string> {
  return {
    "text-foreground": t.foreground,
    "text-muted-foreground": t.mutedForeground,
    "text-edge-pos": t.edgePos,
    "text-edge-neg": t.edgeNeg,
    "text-edge-flat": t.mutedForeground,
    "text-warn": t.warn,
    "text-line": t.line,
    "text-pos-ink": t.posInk,
    "text-pos-qb": t.posQb,
    "text-pos-rb": t.posRb,
    "text-pos-wr": t.posWr,
    "text-pos-te": t.posTe,
    "text-pos-dst": t.posDst,
    "text-card": t.card,
  };
}

export function classToBgOf(t: TokenSet): Record<string, string> {
  return {
    "bg-background": t.background,
    "bg-card": t.card,
    "bg-muted": t.muted,
    "bg-accent": t.accent,
    glass: t.glass,
    "bg-edge-pos-tint": t.edgePosTint,
    "bg-edge-neg-tint": t.edgeNegTint,
    "bg-line-tint": t.lineTint,
    "bg-pos-qb": t.posQb,
    "bg-pos-rb": t.posRb,
    "bg-pos-wr": t.posWr,
    "bg-pos-te": t.posTe,
    "bg-pos-dst": t.posDst,
    "bg-pos-qb-tint": t.posQbTint,
    "bg-pos-rb-tint": t.posRbTint,
    "bg-pos-wr-tint": t.posWrTint,
    "bg-pos-te-tint": t.posTeTint,
    "bg-pos-dst-tint": t.posDstTint,
    card: t.card,
  };
}

export const SURFACES = surfacesOf(LIGHT);
export const READABLE = readableOf(LIGHT);
export const CLASS_TO_FG = classToFgOf(LIGHT);
export const CLASS_TO_BG = classToBgOf(LIGHT);

export function fgFromClass(className: string, t: TokenSet = LIGHT): string | null {
  const map = classToFgOf(t);
  const parts = className.split(/\s+/);
  for (const p of parts) {
    if (map[p]) return map[p];
  }
  if (parts.includes("t-caption") || parts.includes("t-colhead")) return t.mutedForeground;
  if (parts.includes("t-body") || parts.includes("t-title") || parts.includes("t-tile") || parts.includes("t-sentence")) {
    return t.foreground;
  }
  return null;
}

export function bgFromClass(className: string, t: TokenSet = LIGHT): string | null {
  const map = classToBgOf(t);
  const parts = className.split(/\s+/);
  for (const p of parts) {
    if (map[p]) return map[p];
  }
  return null;
}

export function nearestBg(el: Element, fallback?: string, t: TokenSet = LIGHT): string {
  let n: Element | null = el;
  while (n) {
    const cls = typeof n.className === "string" ? n.className : "";
    const bg = bgFromClass(cls, t);
    if (bg) return bg;
    n = n.parentElement;
  }
  return fallback ?? t.card;
}

export function assertReadable(fg: string, bg: string, label: string): void {
  const ratio = contrastRatio(fg, bg);
  if (ratio < AA) {
    throw new Error(`${label}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1 (need ${AA}:1)`);
  }
}
