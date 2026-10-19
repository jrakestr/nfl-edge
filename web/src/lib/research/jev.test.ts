import {
  JEV_LEVELS,
  JEV_MAX_PLAYERS,
  JEV_MODEL,
  JEV_URL,
  JevNotConfigured,
  buildJevRequest,
  combineJev,
  createJevScorer,
  estimateCost,
  getJevScorer,
  jevKey,
  jevStatus,
  metricHash,
  parseJevAnswers,
  planRun,
} from "./jev";
import type { LabPlayer, Metric } from "./score";

const mkPlayer = (id: string, share: number | null): LabPlayer => ({
  playerId: id,
  name: `Player ${id}`,
  team: "DET",
  position: "WR",
  fields: { target_share: share, snap_pct: 0.8 },
});
const PLAYER = mkPlayer("x", 0.28);

const METRIC: Metric = {
  id: "1",
  name: "Volume",
  normalize: "zscore",
  terms: [
    { field: "target_share", weight: 3 },
    { field: "snap_pct", weight: 1 },
  ],
};

const okBody = (a = 4, b = 0) => ({
  answers: {
    target_share: { type: "score", score: a, confidence: 0.9 },
    snap_pct: { type: "score", score: b, confidence: 0.7 },
  },
});

function fakeFetch(handler: (n: number) => { ok: boolean; status: number; body?: unknown }) {
  let n = 0;
  return vi.fn(async () => {
    const r = handler(n++);
    return { ok: r.ok, status: r.status, json: async () => r.body ?? {} };
  });
}

describe("jev key and status", () => {
  it("reads TYPESAFE first, falls back to TYPESAFE_API_KEY, ignores blanks", () => {
    expect(jevKey({ TYPESAFE: "a", TYPESAFE_API_KEY: "b" })).toBe("a");
    expect(jevKey({ TYPESAFE: "  ", TYPESAFE_API_KEY: "b" })).toBe("b");
    expect(jevKey({})).toBeNull();
  });

  it("is not configured without a key, configured with either var", () => {
    expect(jevStatus({})).toEqual({ configured: false, reason: "TYPESAFE is not set" });
    expect(jevStatus({ TYPESAFE: "k" })).toEqual({ configured: true });
    expect(jevStatus({ TYPESAFE_API_KEY: "k" })).toEqual({ configured: true });
    expect(getJevScorer({})).toBeNull();
    expect(getJevScorer({ TYPESAFE: "k" })).not.toBeNull();
  });
});

describe("request", () => {
  it("builds jev-latest with labeled as-of state and one atomic Score question per term", () => {
    const req = buildJevRequest(PLAYER, METRIC);
    expect(req.model).toBe("jev-latest");
    expect(JEV_MODEL).toBe("jev-latest");
    expect(Object.keys(req.questions)).toEqual(["target_share", "snap_pct"]);
    for (const q of Object.values(req.questions)) {
      expect(q.type).toBe("score");
      expect(q.criteria).toHaveLength(JEV_LEVELS);
    }
    expect(req.questions.target_share!.instructions).toContain("Target share");
    expect(req.state).toEqual({
      player: "Player x",
      team: "DET",
      position: "WR",
      fields: { "Target share (% of team targets)": 0.28, "Snap share, recent seasons (%)": 0.8 },
    });
  });

  it("keeps nulls null in state", () => {
    const req = buildJevRequest(mkPlayer("n", null), METRIC);
    expect((req.state.fields as Record<string, unknown>)["Target share (% of team targets)"]).toBeNull();
  });
});

describe("metric hash", () => {
  it("ignores name, id, normalize and term order; changes with weights or fields", () => {
    const same: Metric = {
      ...METRIC,
      id: "9",
      name: "Renamed",
      normalize: "none",
      terms: [...METRIC.terms].reverse(),
    };
    expect(metricHash(same)).toBe(metricHash(METRIC));
    expect(metricHash({ ...METRIC, terms: [{ field: "target_share", weight: 2 }, METRIC.terms[1]!] })).not.toBe(
      metricHash(METRIC),
    );
    expect(metricHash({ ...METRIC, terms: [METRIC.terms[0]!] })).not.toBe(metricHash(METRIC));
  });
});

describe("parse and combine", () => {
  it("parses per-term answers and rejects missing, non-numeric or off-scale ones", () => {
    const fields = ["target_share", "snap_pct"];
    expect(parseJevAnswers(okBody(), fields).target_share).toEqual({ score: 4, confidence: 0.9 });
    expect(() => parseJevAnswers({}, fields)).toThrow("no answers");
    expect(() => parseJevAnswers({ answers: { target_share: { score: 1 } } }, fields)).toThrow("Snap share, recent seasons (%)");
    expect(() => parseJevAnswers({ answers: { target_share: { score: "hi" }, snap_pct: { score: 1 } } }, fields)).toThrow(
      "Target share",
    );
    expect(() => parseJevAnswers(okBody(9, 0), fields)).toThrow("outside");
  });

  it("combines with the user's weights in code: Σ w·s ÷ Σ|w|", () => {
    const answers = parseJevAnswers(okBody(4, 0), ["target_share", "snap_pct"]);
    expect(combineJev(METRIC, answers)).toBeCloseTo((3 * 4 + 1 * 0) / 4);
    const neg: Metric = { ...METRIC, terms: [{ field: "target_share", weight: 1 }, { field: "snap_pct", weight: -1 }] };
    expect(combineJev(neg, answers)).toBeCloseTo((4 - 0) / 2);
  });
});

describe("cost and plan", () => {
  it("over-estimates tokens (body ÷ 2 + overhead) at $0.042 per million", () => {
    const reqs = [buildJevRequest(PLAYER, METRIC)];
    const est = estimateCost(reqs);
    expect(est.requests).toBe(1);
    expect(est.tokens).toBe(Math.ceil(JSON.stringify(reqs[0]).length / 2) + 300 + 20 * 2);
    // Calibration: the smoke call's 992-char body billed 763 tokens; the formula gives 992/2 + 300 + 20 = 816.
    expect(Math.ceil(992 / 2) + 300 + 20).toBeGreaterThanOrEqual(763);
    expect(est.usd).toBeCloseTo(est.tokens * 0.042e-6, 12);
  });

  it("caps to the limit and skips cached players", () => {
    const cands = ["a", "b", "c", "d"].map((id) => mkPlayer(id, 0.2));
    const plan = planRun({ candidates: cands, cachedIds: new Set(["a"]), metric: METRIC, limit: 3 });
    expect(plan.ok && plan.toScore.map((p) => p.playerId)).toEqual(["b", "c"]);
    expect(plan.ok && plan.cached).toBe(1);
  });

  it("everything cached costs nothing", () => {
    const plan = planRun({ candidates: [PLAYER], cachedIds: new Set(["x"]), metric: METRIC, limit: 5 });
    expect(plan.ok && plan.estimate).toEqual({ requests: 0, tokens: 0, usd: 0 });
  });

  it("aborts over the dollar ceiling and rejects a bad or oversized limit", () => {
    const cands = [PLAYER];
    const over = planRun({ candidates: cands, cachedIds: new Set(), metric: METRIC, limit: 1, maxUsd: 0 });
    expect(over.ok).toBe(false);
    expect(!over.ok && over.error).toContain("Run aborted");
    expect(planRun({ candidates: cands, cachedIds: new Set(), metric: METRIC, limit: 0 }).ok).toBe(false);
    expect(
      planRun({ candidates: cands, cachedIds: new Set(), metric: METRIC, limit: JEV_MAX_PLAYERS + 1 }).ok,
    ).toBe(false);
  });
});

describe("scorer (fake fetch, fake key; no real calls)", () => {
  it("makes no request without a key", async () => {
    const fetchImpl = vi.fn();
    const scorer = createJevScorer({ fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(scorer.score([PLAYER], METRIC)).rejects.toBeInstanceOf(JevNotConfigured);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("posts one request per player with a bearer key and returns combined scores", async () => {
    const fetchImpl = fakeFetch(() => ({ ok: true, status: 200, body: okBody(4, 0) }));
    const scorer = createJevScorer({ apiKey: "fake-key", fetchImpl: fetchImpl as unknown as typeof fetch });
    const out = await scorer.score([PLAYER, mkPlayer("y", 0.1)], METRIC);
    expect(out.map((r) => [r.playerId, r.score])).toEqual([
      ["x", 3],
      ["y", 3],
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(JEV_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer fake-key");
    expect(JSON.parse(init.body as string).model).toBe("jev-latest");
  });

  it("an HTTP error fails the whole run with no partial result and no key in the message", async () => {
    const fetchImpl = fakeFetch((n) => (n === 1 ? { ok: false, status: 429 } : { ok: true, status: 200, body: okBody() }));
    const scorer = createJevScorer({ apiKey: "fake-key", fetchImpl: fetchImpl as unknown as typeof fetch });
    const players = ["a", "b", "c"].map((id) => mkPlayer(id, 0.2));
    const err = await scorer.score(players, METRIC).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("HTTP 429");
    expect((err as Error).message).not.toContain("fake-key");
  });

  it("a malformed answer fails the run", async () => {
    const fetchImpl = fakeFetch(() => ({ ok: true, status: 200, body: { answers: { target_share: { score: 1 } } } }));
    const scorer = createJevScorer({ apiKey: "fake-key", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(scorer.score([PLAYER], METRIC)).rejects.toThrow("no score");
  });
});
