import { beforeEach, describe, expect, it, vi } from "vitest";

const saved = new Map<string, unknown>();
const fp: Record<string, number> = {};

vi.mock("@/lib/gemini", () => ({
  GeminiError: class GeminiError extends Error {},
  generateJson: vi.fn(),
  cachedPlayerIntel: vi.fn(async (_runId: string, refId: string) => saved.get(refId) ?? null),
}));
vi.mock("@/lib/db", () => ({
  sql: () => async () => [{ team: "PIT", position: "RB", mean: 9.9, sd: 5, p10: 3.5, p90: 16.9, home_team: "PIT", away_team: "CLE", salary: 5100 }],
}));
vi.mock("@/lib/queries/players", () => ({
  playerById: vi.fn(async (id: string) => ({ display_name: id, position: "RB", latest_team: "PIT" })),
  gameById: vi.fn(async () => null),
  fpByPlayer: vi.fn(async (_s: number, _w: number, ids: string[]) =>
    Object.fromEntries(ids.filter((id) => id in fp).map((id) => [id, fp[id]])),
  ),
}));
vi.mock("@/lib/queries/props", () => ({
  playerNews: vi.fn(async () => []),
  propHistogram: vi.fn(async () => null),
}));
vi.mock("@/lib/queries/usage", () => ({
  playerUsage: vi.fn(async () => null),
  defenseVsPosition: vi.fn(async () => null),
}));
vi.mock("@/lib/queries/runs", () => ({
  runForWeek: vi.fn(async () => ({ run_id: "00000000-0000-0000-0000-000000000001" })),
}));

import { generateJson } from "@/lib/gemini";
import { GET } from "./route";

const mockGenerate = vi.mocked(generateJson);

function get(qs: string) {
  return GET(new Request(`http://localhost/api/player-intel?season=2026&week=8&${qs}`));
}

beforeEach(() => {
  vi.clearAllMocks();
  saved.clear();
  for (const k of Object.keys(fp)) delete fp[k];
  mockGenerate.mockImplementation(async (args) => {
    const refId = args.refId ?? "";
    const data = refId.startsWith("cmp:")
      ? { recommended_player_id: "a", recommended_name: "a", recommendation_mode: "SAFE_FLOOR", headline: refId, bullets: [] }
      : { headline: refId, primary_driver: "sim_ceiling", news_impact: "neutral", bullets: [] };
    saved.set(refId, data);
    return { data, callId: 1 };
  });
});

describe("player-intel saved verdicts", () => {
  it("writes a new compare verdict when adjusted points change", async () => {
    fp.a = 9.9;
    fp.b = 9.9;
    await get("player_id=a&compare_id=b");
    expect(mockGenerate).toHaveBeenCalledTimes(1);

    fp.b = 11.5;
    const res = await (await get("player_id=a&compare_id=b")).json();
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(res.cached).toBe(false);
    expect(res.playerB.sim.adjusted).toBe(10.7);
  });

  it("reuses the saved compare verdict when nothing changed", async () => {
    fp.a = 9.1;
    fp.b = 11.5;
    await get("player_id=a&compare_id=b");
    const res = await (await get("player_id=a&compare_id=b")).json();
    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(res.cached).toBe(true);
  });

  it("writes a new single brief when his payload changes", async () => {
    fp.a = 9.1;
    await get("player_id=a");
    await get("player_id=a");
    expect(mockGenerate).toHaveBeenCalledTimes(1);

    fp.a = 12;
    const res = await (await get("player_id=a")).json();
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    expect(res.cached).toBe(false);
  });
});
