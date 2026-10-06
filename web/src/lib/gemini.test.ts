import { afterEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn(async () => [{ id: 1 }]);
const select = vi.fn(async () => []);

vi.mock("@/lib/db", () => ({
  sql: () => {
    const fn = (..._args: unknown[]) => {
      const q = String(_args[0]);
      if (typeof q === "string" && q.includes("insert")) return insert();
      return select();
    };
    return fn;
  },
}));

import { GeminiError, generateJson, geminiModel } from "./gemini";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
  insert.mockClear();
});

const args = {
  phase: "explain",
  runId: "11111111-1111-1111-1111-111111111111",
  refId: "2026_01_MIA_LV",
  schema: { type: "object", properties: { sentences: { type: "array", items: { type: "string" } } } },
  system: "restate",
  user: "explain",
  payload: { factor: 1.137, pts: 6.36 },
};

describe("geminiModel", () => {
  it("uses Flash-Lite for explain and Flash for write phases", () => {
    expect(geminiModel("explain")).toBe("gemini-3.5-flash-lite");
    expect(geminiModel("claims")).toBe("gemini-3.8-flash");
    expect(geminiModel("optimize-nl")).toBe("gemini-3.8-flash");
  });
});

describe("generateJson", () => {
  it("fails closed when the key is missing", async () => {
    await expect(generateJson(args)).rejects.toThrow(/not configured/);
  });

  it("fails closed on 429", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("rate", { status: 429 })),
    );
    await expect(generateJson(args)).rejects.toBeInstanceOf(GeminiError);
    await expect(generateJson(args)).rejects.toThrow(/rate limit/);
    expect(insert).toHaveBeenCalled();
  });

  it("parses JSON schema output and logs the call", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify({ sentences: ["about six points"] }) }] } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ text: JSON.stringify({ sentences: ["about six points"] }) }] } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const out = await generateJson(args);
    expect(out.data).toEqual({ sentences: ["about six points"] });
    expect(out.callId).toBe(1);
    expect(insert).toHaveBeenCalled();
    const firstUrl = (fetchMock.mock.calls as unknown as [unknown][])[0]?.[0];
    expect(String(firstUrl)).toContain("gemini-3.5-flash-lite");
  });

  it("rejects underscore-cased field names in explain prose", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          driver: "starter passing efficiency",
                          evidence_strength: "thin",
                          sentences: ["Miami qb_pass_factor is 1.137"],
                        }),
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    await expect(generateJson(args)).rejects.toThrow(/field name/);
    expect(insert).toHaveBeenCalled();
  });

  it("accepts a derived percent in explain prose", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          driver: "starter passing efficiency",
                          evidence_strength: "thin",
                          sentences: ["We have Miami six points above the market because the starter factor is 14% higher."],
                        }),
                      },
                    ],
                  },
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    const out = await generateJson(args);
    expect(out.data).toMatchObject({ evidence_strength: "thin" });
  });
});
