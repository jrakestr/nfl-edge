import fs from "node:fs";
import path from "node:path";
import { TEAMS } from "./teams";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const LOGOS = path.resolve(import.meta.dirname, "../../public/logos");

describe("public/logos", () => {
  it("has a non-empty PNG for every nflverse team", () => {
    const abbrs = Object.keys(TEAMS);
    expect(abbrs).toHaveLength(32);
    for (const abbr of abbrs) {
      const file = path.join(LOGOS, `${abbr}.png`);
      expect(fs.existsSync(file), `${abbr} missing`).toBe(true);
      const buf = fs.readFileSync(file);
      expect(buf.byteLength, `${abbr} empty`).toBeGreaterThan(0);
      expect(buf.subarray(0, 8).equals(PNG_MAGIC), `${abbr} not PNG`).toBe(true);
    }
  });
});
