import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import {
  DARK,
  LIGHT,
  READABLE,
  SURFACES,
  TOKENS,
  type TokenSet,
  blend,
  classToFgOf,
  contrastRatio,
  fgFromClass,
  nearestBg,
  passesAA,
  readableOf,
  surfacesOf,
} from "@/lib/contrast";
import { GamesList } from "@/components/games/GamesList";
import { PlayersList } from "@/components/players/PlayersList";
import { FairPropsIndex } from "@/components/props/FairPropsIndex";
import { GradingPage } from "@/components/grading/GradingPage";
import { LineupReview } from "@/components/dfs/LineupReview";
import { WeekBoard, type WeekBoardProps } from "@/components/board/WeekBoard";
import { DEFAULT_FILTERS } from "@/components/board/filters";
import { NO_SCOREBOARD, NO_TRACK, fixture, fixtureChecks, fixtureRows, fixtureVerdicts } from "@/test/fixture";
import { sortVerdicts } from "@/lib/queries/verdicts";
import { maxEdge } from "@/lib/edge";
import { PropDetail } from "@/components/prop/PropDetail";
import { Optimizer } from "@/components/optimize/Optimizer";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/lib/actions/dfs-export", () => ({
  exportSelectedLineups: async () => "",
}));
vi.mock("@/lib/actions/save-market-line", () => ({
  saveMarketLine: async () => ({ ok: true }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/week/1",
  useSearchParams: () => new URLSearchParams(),
}));

const AA = 4.5;
const SRC = join(import.meta.dirname, "..");

function cssToken(css: string, name: string, theme: "light" | "dark" = "light"): string {
  const darkAt = css.search(/\n\[data-theme="dark"\] \{/);
  if (darkAt < 0) throw new Error("dark block missing from globals.css");
  const block = theme === "dark" ? css.slice(darkAt) : css.slice(0, darkAt);
  const m = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`--${name} not found in ${theme} block`);
  return m[1]!.toLowerCase();
}

function walkFiles(dir: string, acc: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(p, acc);
    else if (/\.(tsx|ts|css)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

function textLeaves(root: Element): Element[] {
  const out: Element[] = [];
  const walk = (el: Element) => {
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
    if (hasText) out.push(el);
    for (const c of el.children) walk(c);
  };
  walk(root);
  return out;
}

function nearestFg(el: Element, t: TokenSet): string {
  let n: Element | null = el;
  while (n) {
    const cls = typeof n.className === "string" ? n.className : "";
    const fg = fgFromClass(cls, t);
    if (fg) return fg;
    n = n.parentElement;
  }
  return t.foreground;
}

function audit(container: HTMLElement, label: string, t: TokenSet = LIGHT): void {
  const fails: string[] = [];
  for (const el of textLeaves(container)) {
    const text = (el.textContent ?? "").trim();
    if (!text) continue;
    const cls = typeof el.className === "string" ? el.className : "";
    const fg = nearestFg(el, t);
    const bg = nearestBg(el, t.card, t);
    if (!passesAA(fg, bg)) {
      fails.push(
        `${label}: "${text.slice(0, 40)}" ${fg} on ${bg} = ${contrastRatio(fg, bg).toFixed(2)}:1 (${cls})`,
      );
    }
  }
  expect(fails, fails.join("\n")).toEqual([]);
}

function boardProps(view: "plain" | "table"): WeekBoardProps {
  const run = {
    run_id: fixture.run.run_id,
    created_at: "2026-09-06T19:20:00.000Z",
    draws_per_game: fixture.run.draws,
    git_sha: null,
  };
  return {
    season: 2026,
    week: 1,
    weeks: [1],
    view,
    filters: DEFAULT_FILTERS,
    run,
    runs: [run],
    stale: false,
    verdicts: sortVerdicts(fixtureVerdicts()),
    rows: fixtureRows().sort((a, b) => maxEdge(b) - maxEdge(a)),
    checks: fixtureChecks(),
    track: NO_TRACK,
    scoreboard: NO_SCOREBOARD,
  };
}

function expectCssMatches(theme: "light" | "dark", t: TokenSet) {
  const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
  expect(cssToken(css, "muted-foreground", theme)).toBe(t.mutedForeground.toLowerCase());
  expect(cssToken(css, "foreground", theme)).toBe(t.foreground.toLowerCase());
  expect(cssToken(css, "background", theme)).toBe(t.background.toLowerCase());
  expect(cssToken(css, "card", theme)).toBe(t.card.toLowerCase());
  expect(cssToken(css, "muted", theme)).toBe(t.muted.toLowerCase());
  expect(cssToken(css, "accent", theme)).toBe(t.accent.toLowerCase());
  expect(cssToken(css, "border", theme)).toBe(t.border.toLowerCase());
  expect(cssToken(css, "border-soft", theme)).toBe(t.borderSoft.toLowerCase());
  expect(cssToken(css, "field-cool", theme)).toBe(t.fieldCool.toLowerCase());
  expect(cssToken(css, "field-mid", theme)).toBe(t.fieldMid.toLowerCase());
  expect(cssToken(css, "field-warm", theme)).toBe(t.fieldWarm.toLowerCase());
  expect(cssToken(css, "edge-pos", theme)).toBe(t.edgePos.toLowerCase());
  expect(cssToken(css, "edge-neg", theme)).toBe(t.edgeNeg.toLowerCase());
  expect(cssToken(css, "edge-pos-tint", theme)).toBe(t.edgePosTint.toLowerCase());
  expect(cssToken(css, "edge-neg-tint", theme)).toBe(t.edgeNegTint.toLowerCase());
  expect(cssToken(css, "warn", theme)).toBe(t.warn.toLowerCase());
  expect(cssToken(css, "line", theme)).toBe(t.line.toLowerCase());
  expect(cssToken(css, "pos-ink", theme)).toBe(t.posInk.toLowerCase());
  expect(cssToken(css, "pos-qb", theme)).toBe(t.posQb.toLowerCase());
  expect(cssToken(css, "pos-rb", theme)).toBe(t.posRb.toLowerCase());
  expect(cssToken(css, "pos-wr", theme)).toBe(t.posWr.toLowerCase());
  expect(cssToken(css, "pos-te", theme)).toBe(t.posTe.toLowerCase());
  expect(cssToken(css, "pos-dst", theme)).toBe(t.posDst.toLowerCase());
}

describe("token contrast ≥ 4.5:1", () => {
  it("globals.css matches LIGHT and DARK maps", () => {
    const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
    expectCssMatches("light", LIGHT);
    expectCssMatches("dark", DARK);
    expect(css).toMatch(/@custom-variant dark/);
    expect(css).toMatch(/\[data-theme="dark"\]/);
    expect(css).toMatch(/prefers-color-scheme:\s*dark/);
    expect(css).toMatch(/:root:not\(\[data-theme="light"\]\)/);
    expect(css).toMatch(/\.t-caption[\s\S]*?color:\s*var\(--muted-foreground\)/);
    expect(css).not.toMatch(/--dim\b/);
    expect(css).toMatch(/--glass:\s*rgb\(255 255 255 \/ 0\.72\)/);
    expect(css).toMatch(/\n\[data-theme="dark"\] \{[\s\S]*?--glass:\s*rgb\(28 30 38 \/ 0\.72\)/);
    expect(css).toMatch(/\.glass[\s\S]*?backdrop-filter:\s*blur\(12px\)/);
    expect(css).toMatch(/body[\s\S]*?var\(--field-cool\)[\s\S]*?var\(--field-mid\)[\s\S]*?var\(--field-warm\)/);
    expect(css).toMatch(/\.card[\s\S]*?background:\s*var\(--card\)/);
    expect(css).not.toMatch(/\.card[\s\S]{0,180}backdrop-filter/);
    expect(css).not.toMatch(/\.card[\s\S]{0,180}box-shadow/);
  });

  it("glass composite is theme fill 0.72 over the cool field stop", () => {
    expect(LIGHT.glass).toBe(blend("#FFFFFF", LIGHT.fieldCool, 0.72).toUpperCase());
    expect(DARK.glass).toBe(blend(DARK.card, DARK.fieldCool, 0.72).toUpperCase());
  });

  it.each([
    ["light", LIGHT],
    ["dark", DARK],
  ] as const)("%s readable roles on every surface", (_name, t) => {
    const readable = readableOf(t);
    const surfaces = surfacesOf(t);
    for (const [role, fg] of Object.entries(readable)) {
      for (const [surface, bg] of Object.entries(surfaces)) {
        expect(contrastRatio(fg, bg), `${role} on ${surface}`).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it.each([
    ["light", LIGHT],
    ["dark", DARK],
  ] as const)("%s semantic colors on their tints; pos-ink on fills", (_name, t) => {
    expect(contrastRatio(t.edgePos, t.edgePosTint)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(t.edgeNeg, t.edgeNegTint)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(t.line, t.lineTint)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(t.posInk, t.posQb)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(t.posInk, t.posRb)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(t.posInk, t.posWr)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(t.posInk, t.posTe)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(t.posInk, t.posDst)).toBeGreaterThanOrEqual(AA);
  });

  it("GapTrack dark rail and tints are named and visible on the dark card", () => {
    expect(DARK.muted).not.toBe(LIGHT.muted);
    expect(DARK.edgePosTint).not.toBe(LIGHT.edgePosTint);
    expect(DARK.edgeNegTint).not.toBe(LIGHT.edgeNegTint);
    expect(DARK.muted).not.toBe(DARK.card);
    expect(DARK.edgePosTint).not.toBe(DARK.card);
    expect(DARK.edgeNegTint).not.toBe(DARK.card);
    expect(DARK.edgePosTint).not.toBe(DARK.muted);
    expect(DARK.edgeNegTint).not.toBe(DARK.muted);
    expect(contrastRatio(DARK.muted, DARK.card)).toBeGreaterThan(1.15);
    expect(contrastRatio(DARK.edgePosTint, DARK.card)).toBeGreaterThan(1.15);
    expect(contrastRatio(DARK.edgeNegTint, DARK.card)).toBeGreaterThan(1.15);
  });

  it("70% edge color would fail in light, so opacity is not used for readable numbers", () => {
    expect(contrastRatio(blend(LIGHT.edgePos, LIGHT.card, 0.7), LIGHT.card)).toBeLessThan(AA);
    expect(contrastRatio(blend(LIGHT.edgeNeg, LIGHT.card, 0.7), LIGHT.card)).toBeLessThan(AA);
  });

  it("TOKENS is the light map; --dim is gone", () => {
    expect(TOKENS).toBe(LIGHT);
    expect(TOKENS).not.toHaveProperty("dim");
    expect(READABLE).not.toHaveProperty("dim");
    expect(SURFACES.card).toBe(LIGHT.card);
    expect(classToFgOf(LIGHT)).not.toHaveProperty("text-dim");
  });
});

describe("source scan: --dim retired; glass only on overlays", () => {
  it("no --dim or text-dim in app source", () => {
    const files = walkFiles(join(SRC, "components")).concat(walkFiles(join(SRC, "app"))).concat([
      join(SRC, "lib/contrast.ts"),
    ]);
    const bad: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (file.endsWith("contrast.test.tsx")) continue;
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        if (/\btext-dim\b|--dim\b|--color-dim\b/.test(line)) {
          bad.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("EdgeDiff does not fade readable color with opacity", () => {
    const src = readFileSync(join(SRC, "components/board/EdgeCell.tsx"), "utf8");
    expect(src).not.toMatch(/opacity-70/);
  });

  it("DataTable sits on solid card, never glass or backdrop-blur", () => {
    const src = readFileSync(join(SRC, "components/ui/DataTable.tsx"), "utf8");
    expect(src).toMatch(/"card overflow-x-auto"/);
    expect(src).not.toMatch(/backdrop-blur|className="glass|\.glass/);
  });

  it("sidebar, optimizer settings, and claims cards are solid, not glass", () => {
    const sidebar = readFileSync(join(SRC, "components/shell/Sidebar.tsx"), "utf8");
    expect(sidebar).toMatch(/bg-card/);
    expect(sidebar).not.toMatch(/\bglass\b/);
    const opt = readFileSync(join(SRC, "components/optimize/Optimizer.tsx"), "utf8");
    expect(opt).toMatch(/aria-label="Optimizer settings"/);
    expect(opt).not.toMatch(/aria-label="Optimizer settings"[\s\S]{0,80}glass/);
    const claims = readFileSync(join(SRC, "components/claims/ClaimsPanel.tsx"), "utf8");
    expect(claims).not.toMatch(/\bglass\b/);
  });

  it("overlays keep glass: TopBar, WeekHeader, Players summary, Sheet", () => {
    expect(readFileSync(join(SRC, "components/shell/TopBar.tsx"), "utf8")).toMatch(/className="glass /);
    expect(readFileSync(join(SRC, "components/board/WeekHeader.tsx"), "utf8")).toMatch(
      /glass sticky top-\[var\(--topbar-height\)\]/,
    );
    expect(readFileSync(join(SRC, "components/players/PlayersList.tsx"), "utf8")).toMatch(
      /className="glass sticky bottom-3/,
    );
    expect(readFileSync(join(SRC, "components/ui/sheet.tsx"), "utf8")).toMatch(/"glass /);
  });
});

describe("page audit: readable text ≥ 4.5:1", () => {
  it.each(["light", "dark"] as const)("Edge board plain (%s)", (theme) => {
    const { container } = render(<WeekBoard {...boardProps("plain")} />);
    audit(container, `board-plain-${theme}`, theme === "dark" ? DARK : LIGHT);
  });

  it.each(["light", "dark"] as const)("Edge board table (%s)", (theme) => {
    const { container } = render(<WeekBoard {...boardProps("table")} />);
    audit(container, `board-table-${theme}`, theme === "dark" ? DARK : LIGHT);
  });

  it.each(["light", "dark"] as const)("Games empty (%s)", (theme) => {
    const { container } = render(<GamesList />);
    audit(container, `games-${theme}`, theme === "dark" ? DARK : LIGHT);
  });

  it.each(["light", "dark"] as const)("Players empty (%s)", (theme) => {
    const { container } = render(<PlayersList />);
    audit(container, `players-${theme}`, theme === "dark" ? DARK : LIGHT);
  });

  it.each(["light", "dark"] as const)("Props empty (%s)", (theme) => {
    const { container } = render(<FairPropsIndex />);
    audit(container, `props-${theme}`, theme === "dark" ? DARK : LIGHT);
  });

  it.each(["light", "dark"] as const)("Lineups empty (%s)", (theme) => {
    const { container } = render(<LineupReview week="1" site="dk" slate="main" />);
    audit(container, `lineups-${theme}`, theme === "dark" ? DARK : LIGHT);
  });

  it.each(["light", "dark"] as const)("Grading empty (%s)", (theme) => {
    const { container } = render(<GradingPage />);
    audit(container, `grading-${theme}`, theme === "dark" ? DARK : LIGHT);
  });

  it.each(["light", "dark"] as const)("Optimize empty (%s)", (theme) => {
    const { container } = render(<Optimizer week="1" site="dk" slate="main" />);
    audit(container, `optimize-${theme}`, theme === "dark" ? DARK : LIGHT);
  });

  it.each(["light", "dark"] as const)("Prop detail empty (%s)", (theme) => {
    const { container } = render(
      <PropDetail
        player={null}
        game={null}
        playerId="nobody"
        fairs={[]}
        log={[]}
        corrs={[]}
        matchup={[]}
        timeline={[]}
        histByStat={{}}
        currentSeason={2026}
      />,
    );
    audit(container, `prop-detail-${theme}`, theme === "dark" ? DARK : LIGHT);
  });
});
