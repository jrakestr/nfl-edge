import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/gemini", () => ({
  GeminiError: class GeminiError extends Error {},
  generateJson: vi.fn(),
}));

import { generateJson, type GenerateJsonArgs } from "@/lib/gemini";
import type { OptPlayer } from "@/lib/optimize/types";
import { POST } from "./route";

const mockGenerateJson = vi.mocked(generateJson);

function player(partial: Partial<OptPlayer> & Pick<OptPlayer, "player_dk_id" | "team">): OptPlayer {
  return {
    name: partial.player_dk_id,
    position: "WR",
    opponent: "DAL",
    salary: 5000,
    proj: 12,
    value: 2,
    proj_own: 0.1,
    ...partial,
  };
}

const players: OptPlayer[] = [
  player({ player_dk_id: "qb1", team: "DET", position: "QB", value: 5 }),
  player({ player_dk_id: "rb1", team: "DET", position: "RB", value: 4 }),
  player({ player_dk_id: "wr1", team: "KC", position: "WR", value: 4.5 }),
  player({ player_dk_id: "wr2", team: "KC", position: "WR", value: 1 }),
  player({ player_dk_id: "te1", team: "BUF", position: "TE", value: 2 }),
  player({ player_dk_id: "dst1", team: "BUF", position: "DST", value: 2.5 }),
];

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/optimize-nl", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("optimize-nl value phrasings", () => {
  it("sort by points per dollar returns a view and no filter", async () => {
    mockGenerateJson.mockResolvedValueOnce({ data: { sortBy: "value", sortDir: "desc" }, callId: 1 });
    const res = await post({ text: "sort by points per dollar", players });
    const body = (await res.json()) as { view: unknown; excl: string[] };
    expect(body.view).toEqual({ sortBy: "value", sortDir: "desc" });
    expect(body.excl).toHaveLength(0);
  });

  it("only players with at least 3 value excludes below-threshold names", async () => {
    mockGenerateJson.mockResolvedValueOnce({ data: { minValue: 3 }, callId: 2 });
    const res = await post({ text: "only players with at least 3 value", players });
    const body = (await res.json()) as { view: unknown; excl: string[] };
    expect(body.view).toBeNull();
    expect(body.excl).toEqual(expect.arrayContaining(["wr2", "te1", "dst1"]));
    expect(body.excl).not.toContain("qb1");
  });

  it("top 1 value at each position drops the weaker WR", async () => {
    mockGenerateJson.mockResolvedValueOnce({ data: { topValuePerPos: 1 }, callId: 3 });
    const res = await post({ text: "top 1 value at each position", players });
    const body = (await res.json()) as { view: unknown; excl: string[] };
    expect(body.view).toBeNull();
    expect(body.excl).toEqual(["wr2"]);
  });

  it("forwards locks so a forced pick survives the value filter", async () => {
    mockGenerateJson.mockResolvedValueOnce({ data: { minValue: 3 }, callId: 4 });
    const res = await post({ text: "only players with at least 3 value", players, lock: ["wr2"] });
    const body = (await res.json()) as { excl: string[] };
    expect(body.excl).not.toContain("wr2");
    expect(body.excl).toContain("te1");
  });

  it("constrains Gemini to tokens with sort-vs-filter rules", async () => {
    mockGenerateJson.mockResolvedValueOnce({ data: { sortBy: "value" }, callId: 5 });
    await post({ text: "show me by bang for the buck", players });
    const args = mockGenerateJson.mock.calls[0]?.[0] as GenerateJsonArgs;
    expect(args.system).toMatch(/bang for the buck/);
    expect(args.system).toMatch(/view, not a filter/);
    expect(args.system).toMatch(/Never emit projection numbers/);
    const props = (args.schema as { properties: Record<string, unknown> }).properties;
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining(["minValue", "topValuePerPos", "sortBy", "sortDir"]),
    );
  });
});
