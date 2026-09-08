import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PATHS = [
  { name: "Edge board", path: "/week/1" },
  { name: "Lineups", path: "/week/1/dfs/dk/main" },
  { name: "Players", path: "/week/1/players/dk/main" },
  { name: "Props", path: "/props" },
  { name: "Optimize", path: "/week/1/optimize/dk/main" },
] as const;

test.beforeAll(() => {
  if (!process.env.PREVIEW_URL) {
    throw new Error("PREVIEW_URL is required");
  }
});

test.beforeEach(async ({ page }) => {
  const share = process.env.VERCEL_SHARE_URL;
  if (share) {
    await page.goto(share, { waitUntil: "load" });
  }
});

for (const { name, path } of PATHS) {
  test(`${name} (${path}) has no color-contrast violations`, async ({ page }) => {
    const res = await page.goto(path, { waitUntil: "load" });
    expect(res, `${path} did not respond`).toBeTruthy();
    expect(res!.ok(), `${path} status ${res!.status()}`).toBeTruthy();
    const title = await page.title();
    expect(title.toLowerCase(), `${path} looks like a Vercel protection page`).not.toMatch(
      /authentication|login|vercel/,
    );
    await expect(page.locator("main")).toBeVisible();
    const results = await new AxeBuilder({ page }).analyze();
    const contrast = results.violations.filter((v) => v.id === "color-contrast");
    expect(contrast, JSON.stringify(contrast, null, 2)).toEqual([]);
  });
}
