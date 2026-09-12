import { readFileSync } from "node:fs";
import path from "node:path";
import { lastName } from "./LineupCard";

const cases = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, "../../../../tests/fixtures/last_name_cases.json"),
    "utf8",
  ),
) as { name: string; last: string }[];

describe("lastName shared cases", () => {
  it.each(cases)("$name → $last", ({ name, last }) => {
    expect(lastName(name)).toBe(last);
  });
});
