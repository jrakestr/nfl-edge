#!/usr/bin/env node
/**
 * Resize docs/nfl-team-logos/png/{slug}.png → web/public/logos/{ABBR}.png
 * Longest side 64px, full RGBA. Missing source fails.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const SRC_DIR = path.join(ROOT, "docs/nfl-team-logos/png");
const OUT_DIR = path.join(ROOT, "web/public/logos");
const BUDGET = 400 * 1024;
const MAX_SIDE = 64;
const WHITE_TOL = 20;

/** Explicit nflverse abbr → source slug. LA / JAX / WAS, never LAR / JAC / WSH. */
const SLUGS = {
  ARI: "arizona-cardinals",
  ATL: "atlanta-falcons",
  BAL: "baltimore-ravens",
  BUF: "buffalo-bills",
  CAR: "carolina-panthers",
  CHI: "chicago-bears",
  CIN: "cincinnati-bengals",
  CLE: "cleveland-browns",
  DAL: "dallas-cowboys",
  DEN: "denver-broncos",
  DET: "detroit-lions",
  GB: "green-bay-packers",
  HOU: "houston-texans",
  IND: "indianapolis-colts",
  JAX: "jacksonville-jaguars",
  KC: "kansas-city-chiefs",
  LA: "los-angeles-rams",
  LAC: "los-angeles-chargers",
  LV: "las-vegas-raiders",
  MIA: "miami-dolphins",
  MIN: "minnesota-vikings",
  NE: "new-england-patriots",
  NO: "new-orleans-saints",
  NYG: "new-york-giants",
  NYJ: "new-york-jets",
  PHI: "philadelphia-eagles",
  PIT: "pittsburgh-steelers",
  SEA: "seattle-seahawks",
  SF: "san-francisco-49ers",
  TB: "tampa-bay-buccaneers",
  TEN: "tennessee-titans",
  WAS: "washington-commanders",
};

function isNearWhite(r, g, b, a) {
  if (a === 0) return false;
  return r >= 255 - WHITE_TOL && g >= 255 - WHITE_TOL && b >= 255 - WHITE_TOL;
}

/** Corner flood-fill of connected near-white → alpha 0. Interior white stays. */
function floodFillCorners(data, width, height) {
  const seen = new Uint8Array(width * height);
  const stack = [];
  for (const [x, y] of [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
  ]) {
    const i = y * width + x;
    const o = i * 4;
    if (isNearWhite(data[o], data[o + 1], data[o + 2], data[o + 3])) stack.push(i);
  }
  while (stack.length) {
    const i = stack.pop();
    if (seen[i]) continue;
    const o = i * 4;
    if (!isNearWhite(data[o], data[o + 1], data[o + 2], data[o + 3])) continue;
    seen[i] = 1;
    data[o + 3] = 0;
    const x = i % width;
    const y = (i / width) | 0;
    if (x > 0) stack.push(i - 1);
    if (x < width - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - width);
    if (y < height - 1) stack.push(i + width);
  }
}

/**
 * Hand-mask for the Packers oval: keep non-white pixels plus a 3px white ring
 * around them. Exterior white becomes transparent. Does not change WHITE_TOL.
 */
function handMaskOval(data, width, height) {
  const n = width * height;
  const logo = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (!isNearWhite(data[o], data[o + 1], data[o + 2], data[o + 3])) logo[i] = 1;
  }
  const ring = 3;
  const keep = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!logo[y * width + x]) continue;
      for (let dy = -ring; dy <= ring; dy++) {
        for (let dx = -ring; dx <= ring; dx++) {
          if (dx * dx + dy * dy > ring * ring) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) keep[ny * width + nx] = 1;
        }
      }
    }
  }
  for (let i = 0; i < n; i++) {
    if (keep[i]) continue;
    data[i * 4 + 3] = 0;
  }
}

/** True if any opaque near-white pixel sits on the outer edge of the opaque region. */
function opaqueWhiteOnPerimeter(data, width, height) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const o = i * 4;
      if (data[o + 3] === 0) continue;
      if (!isNearWhite(data[o], data[o + 1], data[o + 2], data[o + 3])) continue;
      const edge =
        x === 0 ||
        y === 0 ||
        x === width - 1 ||
        y === height - 1 ||
        data[((y - 1) * width + x) * 4 + 3] === 0 ||
        data[((y + 1) * width + x) * 4 + 3] === 0 ||
        data[(y * width + x - 1) * 4 + 3] === 0 ||
        data[(y * width + x + 1) * 4 + 3] === 0;
      if (edge) return true;
    }
  }
  return false;
}

async function loadRgba(src) {
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 4) throw new Error(`expected RGBA: ${src}`);
  return { data: Buffer.from(data), width: info.width, height: info.height };
}

async function writeResized(rgba, dest) {
  await sharp(rgba.data, {
    raw: { width: rgba.width, height: rgba.height, channels: 4 },
  })
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .png({ compressionLevel: 9, palette: false })
    .toFile(dest);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const missing = [];
  for (const [abbr, slug] of Object.entries(SLUGS)) {
    const src = path.join(SRC_DIR, `${slug}.png`);
    if (!fs.existsSync(src) || fs.statSync(src).size === 0) missing.push(`${abbr} (${slug}.png)`);
  }
  if (missing.length) {
    console.error(`missing source for: ${missing.join(", ")}`);
    process.exit(1);
  }

  let gbMode = "flood";
  for (const [abbr, slug] of Object.entries(SLUGS)) {
    const src = path.join(SRC_DIR, `${slug}.png`);
    const dest = path.join(OUT_DIR, `${abbr}.png`);
    const rgba = await loadRgba(src);
    if (abbr === "ARI") {
      floodFillCorners(rgba.data, rgba.width, rgba.height);
    } else if (abbr === "GB") {
      const trial = Buffer.from(rgba.data);
      floodFillCorners(trial, rgba.width, rgba.height);
      if (opaqueWhiteOnPerimeter(trial, rgba.width, rgba.height)) {
        rgba.data = trial;
        gbMode = "flood";
      } else {
        handMaskOval(rgba.data, rgba.width, rgba.height);
        gbMode = "hand-mask";
      }
    }
    await writeResized(rgba, dest);
    const out = fs.statSync(dest);
    if (out.size === 0) {
      console.error(`empty output: ${dest}`);
      process.exit(1);
    }
  }

  let total = 0;
  for (const abbr of Object.keys(SLUGS)) {
    total += fs.statSync(path.join(OUT_DIR, `${abbr}.png`)).size;
  }
  console.log(`wrote ${Object.keys(SLUGS).length} logos (${total} bytes), GB=${gbMode}`);
  if (total > BUDGET) {
    console.error(`logo set ${total} bytes exceeds ${BUDGET} budget (likely unsized originals)`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
