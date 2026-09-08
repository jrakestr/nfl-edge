import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { render } from "@testing-library/react";
import {
  CLASS_TO_FG,
  READABLE,
  SURFACES,
  TOKENS,
  blend,
  contrastRatio,
  fgFromClass,
  nearestBg,
  passesAA,
} from "@/lib/contrast";
import { GamesList } from "@/components/games/GamesList";
import { PlayersList } from "@/components/players/PlayersList";
import { PropsIndex } from "@/components/props/PropsIndex";
import { GradingPage } from "@/components/grading/GradingPage";
import { LineupReview } from "@/components/dfs/LineupReview";
import { WeekBoard, type WeekBoardProps } from "@/components/board/WeekBoard";
import { DEFAULT_FILTERS } from "@/components/board/filters";
import { NO_TRACK, fixture, fixtureChecks, fixtureRows, fixtureVerdicts } from "@/test/fixture";
import { sortVerdicts } from "@/lib/queries/verdicts";
import { maxEdge } from "@/lib/edge";
import { PropDetail } from "@/components/prop/PropDetail";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/lib/actions/dfs-export", () => ({
  exportSelectedLineups: async () => "",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/week/1",
  useSearchParams: () => new URLSearchParams(),
}));

const AA = 4.5;
const SRC = join(import.meta.dirname, "..");

const DECORATIVE = /^[@·/—\s]+$/;

function cssToken(css: string, name: string): string {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!m) throw new Error(`--${name} not found in globals.css`);
  return m[1]!.toLowerCase();
}

function walkFiles(dir: string, acc: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "ui" && dir.endsWith("components")) {
      // still scan ui for text-dim / opacity-70 on readable roles
    }
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

function nearestFg(el: Element): string {
  let n: Element | null = el;
  while (n) {
    const cls = typeof n.className === "string" ? n.className : "";
    const fg = fgFromClass(cls);
    if (fg) return fg;
    n = n.parentElement;
  }
  return TOKENS.foreground;
}

function audit(container: HTMLElement, label: string): void {
  const fails: string[] = [];
  for (const el of textLeaves(container)) {
    const text = (el.textContent ?? "").trim();
    if (!text) continue;
    const cls = typeof el.className === "string" ? el.className : "";
    const fg = nearestFg(el);
    const bg = nearestBg(el);
    const decorative = DECORATIVE.test(text);
    if (fg === TOKENS.dim && !decorative) {
      fails.push(`${label}: dim used for "${text.slice(0, 40)}" (${cls})`);
      continue;
    }
    if (decorative && fg === TOKENS.dim) continue;
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
  };
}

describe("token contrast ≥ 4.5:1", () => {
  it("globals.css matches TOKENS", () => {
    const css = readFileSync(join(SRC, "app/globals.css"), "utf8");
    expect(cssToken(css, "muted-foreground")).toBe(TOKENS.mutedForeground.toLowerCase());
    expect(cssToken(css, "foreground")).toBe(TOKENS.foreground.toLowerCase());
    expect(cssToken(css, "background")).toBe(TOKENS.background.toLowerCase());
    expect(cssToken(css, "card")).toBe(TOKENS.card.toLowerCase());
    expect(cssToken(css, "muted")).toBe(TOKENS.muted.toLowerCase());
    expect(cssToken(css, "accent")).toBe(TOKENS.accent.toLowerCase());
    expect(cssToken(css, "edge-pos")).toBe(TOKENS.edgePos.toLowerCase());
    expect(cssToken(css, "edge-neg")).toBe(TOKENS.edgeNeg.toLowerCase());
    expect(cssToken(css, "warn")).toBe(TOKENS.warn.toLowerCase());
    expect(cssToken(css, "line")).toBe(TOKENS.line.toLowerCase());
    expect(cssToken(css, "pos-qb")).toBe(TOKENS.posQb.toLowerCase());
    expect(cssToken(css, "pos-rb")).toBe(TOKENS.posRb.toLowerCase());
    expect(cssToken(css, "pos-wr")).toBe(TOKENS.posWr.toLowerCase());
    expect(cssToken(css, "pos-te")).toBe(TOKENS.posTe.toLowerCase());
    expect(cssToken(css, "pos-dst")).toBe(TOKENS.posDst.toLowerCase());
    expect(css).toMatch(/\.t-caption[\s\S]*?color:\s*var\(--muted-foreground\)/);
    expect(css).not.toMatch(/\.t-caption[\s\S]{0,80}var\(--dim\)/);
  });

  it.each(Object.entries(READABLE))("%s on every surface", (_name, fg) => {
    for (const [surface, bg] of Object.entries(SURFACES)) {
      expect(contrastRatio(fg, bg), `${_name} on ${surface}`).toBeGreaterThanOrEqual(AA);
    }
  });

  it("semantic colors on their tints", () => {
    expect(contrastRatio(TOKENS.edgePos, TOKENS.edgePosTint)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(TOKENS.edgeNeg, TOKENS.edgeNegTint)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(TOKENS.line, TOKENS.lineTint)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(TOKENS.posQb, TOKENS.posQbTint)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(TOKENS.posRb, TOKENS.posRbTint)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(TOKENS.posWr, TOKENS.posWrTint)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(TOKENS.posTe, TOKENS.posTeTint)).toBeGreaterThanOrEqual(AA);
    expect(contrastRatio(TOKENS.posDst, TOKENS.posDstTint)).toBeGreaterThanOrEqual(AA);
  });

  it("70% edge color would fail, so opacity is not used for readable numbers", () => {
    expect(contrastRatio(blend(TOKENS.edgePos, TOKENS.card, 0.7), TOKENS.card)).toBeLessThan(AA);
    expect(contrastRatio(blend(TOKENS.edgeNeg, TOKENS.card, 0.7), TOKENS.card)).toBeLessThan(AA);
  });

  it("--dim fails AA and is not a readable token", () => {
    expect(contrastRatio(TOKENS.dim, TOKENS.card)).toBeLessThan(AA);
    expect(READABLE).not.toHaveProperty("dim");
    expect(CLASS_TO_FG["text-dim"]).toBe(TOKENS.dim);
  });
});

describe("source scan: --dim is decorative only", () => {
  const ALLOW = [
    /placeholder:text-dim/,
    /className="text-dim"/,
    /className=\{cn\("tnum text-dim"/,
    /<span className="text-dim">/,
  ];

  it("no t-colhead text-dim; text-dim only on punctuation / placeholders", () => {
    const files = walkFiles(join(SRC, "components")).concat(walkFiles(join(SRC, "app")));
    const bad: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (text.includes("t-colhead text-dim") || text.includes("t-colhead text-right text-dim")) {
        bad.push(`${file}: t-colhead uses text-dim`);
      }
      const lines = text.split("\n");
      lines.forEach((line, i) => {
        if (!line.includes("text-dim")) return;
        if (ALLOW.some((re) => re.test(line))) {
          const rest = line.replace(/placeholder:text-dim/g, "");
          if (/text-dim/.test(rest) && !ALLOW.some((re) => re.test(line))) {
            bad.push(`${file}:${i + 1}: ${line.trim()}`);
          }
          return;
        }
        bad.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });

  it("EdgeDiff does not fade readable color with opacity", () => {
    const src = readFileSync(join(SRC, "components/board/EdgeCell.tsx"), "utf8");
    expect(src).not.toMatch(/opacity-70/);
  });
});

describe("page audit: readable text ≥ 4.5:1", () => {
  it("Edge board plain", () => {
    const { container } = render(<WeekBoard {...boardProps("plain")} />);
    audit(container, "board-plain");
  });

  it("Edge board table", () => {
    const { container } = render(<WeekBoard {...boardProps("table")} />);
    audit(container, "board-table");
  });

  it("Games empty", () => {
    const { container } = render(<GamesList />);
    audit(container, "games");
  });

  it("Players empty", () => {
    const { container } = render(<PlayersList />);
    audit(container, "players");
  });

  it("Props empty", () => {
    const { container } = render(<PropsIndex />);
    audit(container, "props");
  });

  it("Lineups empty", () => {
    const { container } = render(<LineupReview week="1" site="dk" slate="main" />);
    audit(container, "lineups");
  });

  it("Grading empty", () => {
    const { container } = render(<GradingPage />);
    audit(container, "grading");
  });

  it("Prop detail empty", () => {
    const { container } = render(
      <PropDetail
        player={null}
        game={null}
        playerId="nobody"
        edges={[]}
        log={[]}
        corrs={[]}
        matchup={[]}
        timeline={[]}
        histByStat={{}}
      />,
    );
    audit(container, "prop-detail");
  });
});
