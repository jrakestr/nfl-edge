import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(import.meta.dirname, "..");
const COMPONENTS = join(SRC, "components");
const GLOBALS = join(SRC, "app/globals.css");

const BANNED = /\btext-xs\b|text-\[11px\]|text-\[12px\]|text-\[13px\]|text-\[0\.8rem\]/;
const ARBITRARY_PX = /text-\[(\d+)px\]/g;

function walkFiles(dir: string, acc: string[] = []): string[] {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(p, acc);
    else if (/\.(tsx|ts|css)$/.test(ent.name)) acc.push(p);
  }
  return acc;
}

function roleSize(css: string, role: string): number {
  const m = css.match(new RegExp(`\\.${role}\\s*\\{[^}]*font-size:\\s*(\\d+)px`));
  if (!m) throw new Error(`.${role} font-size missing from globals.css`);
  return Number(m[1]);
}

describe("type floor 14px", () => {
  it("globals.css roles match the rebuilt scale", () => {
    const css = readFileSync(GLOBALS, "utf8");
    expect(roleSize(css, "t-caption")).toBe(14);
    expect(roleSize(css, "t-colhead")).toBe(14);
    expect(roleSize(css, "t-body")).toBe(15);
    expect(roleSize(css, "t-sentence")).toBe(16);
    expect(roleSize(css, "t-title")).toBe(22);
    expect(roleSize(css, "t-tile")).toBe(32);
    expect(css).toMatch(/body[\s\S]*?font-size:\s*15px/);
    expect(css).toMatch(/\.t-body\.tnum\s*\{[\s\S]*?font-weight:\s*600/);
  });

  it("components/ has no sub-14 type utilities", () => {
    const bad: string[] = [];
    for (const file of walkFiles(COMPONENTS)) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (BANNED.test(line)) {
          bad.push(`${file}:${i + 1}: ${line.trim()}`);
          return;
        }
        for (const m of line.matchAll(ARBITRARY_PX)) {
          if (Number(m[1]) < 14) {
            bad.push(`${file}:${i + 1}: ${line.trim()}`);
          }
        }
      });
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
});
