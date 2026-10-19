import { scorePlayers, validateMetric, type LabPlayer, type Metric } from "./score";

const AVAILABLE = ["target_share", "snap_pct", "targets_l3"];

function p(id: string, position: string, fields: Record<string, number | null>): LabPlayer {
  return { playerId: id, name: id, team: "DET", position, fields };
}

const PLAYERS: LabPlayer[] = [
  p("wr1", "WR", { target_share: 0.3, snap_pct: 0.9, targets_l3: 10 }),
  p("wr2", "WR", { target_share: 0.2, snap_pct: 0.8, targets_l3: 6 }),
  p("wr3", "WR", { target_share: 0.1, snap_pct: 0.7, targets_l3: null }),
  p("te1", "TE", { target_share: 0.15, snap_pct: 0.5, targets_l3: 4 }),
];

const RAW: Metric = {
  id: "1",
  name: "Raw",
  normalize: "none",
  terms: [
    { field: "target_share", weight: 10 },
    { field: "snap_pct", weight: 2 },
  ],
};

describe("scorePlayers raw", () => {
  it("is the weighted sum of the fields", () => {
    const { rows, metricErrors } = scorePlayers(PLAYERS, [RAW], AVAILABLE);
    expect(metricErrors).toEqual({});
    expect(rows.find((r) => r.playerId === "wr1")!.scores["1"]!.value).toBeCloseTo(10 * 0.3 + 2 * 0.9);
    expect(rows.find((r) => r.playerId === "te1")!.scores["1"]!.value).toBeCloseTo(10 * 0.15 + 2 * 0.5);
  });

  it("ranks overall and within position, ties share a rank", () => {
    const tied = [
      p("a", "WR", { target_share: 0.2, snap_pct: 1 }),
      p("b", "WR", { target_share: 0.2, snap_pct: 1 }),
      p("c", "RB", { target_share: 0.1, snap_pct: 1 }),
    ];
    const { rows } = scorePlayers(tied, [RAW], AVAILABLE);
    const by = Object.fromEntries(rows.map((r) => [r.playerId, r.scores["1"]!]));
    expect([by.a!.rank, by.b!.rank, by.c!.rank]).toEqual([1, 1, 3]);
    expect([by.a!.positionRank, by.c!.positionRank]).toEqual([1, 1]);
  });
});

describe("scorePlayers zscore", () => {
  const Z: Metric = { id: "z", name: "Z", normalize: "zscore", terms: [{ field: "target_share", weight: 1 }] };

  it("standardizes within position (population sd)", () => {
    const { rows } = scorePlayers(PLAYERS, [Z], AVAILABLE);
    // WR target_share 0.3, 0.2, 0.1: mean 0.2, sd sqrt(2/3)*0.1
    const sd = Math.sqrt((0.01 + 0 + 0.01) / 3);
    expect(rows.find((r) => r.playerId === "wr1")!.scores.z!.value).toBeCloseTo(0.1 / sd);
    expect(rows.find((r) => r.playerId === "wr2")!.scores.z!.value).toBeCloseTo(0);
    expect(rows.find((r) => r.playerId === "wr3")!.scores.z!.value).toBeCloseTo(-0.1 / sd);
  });

  it("a position with fewer than two players has no z-score and says why", () => {
    const { rows } = scorePlayers(PLAYERS, [Z], AVAILABLE);
    const te = rows.find((r) => r.playerId === "te1")!.scores.z!;
    expect(te.value).toBeNull();
    expect(te.missing).toEqual(["Target share (% of team targets) (too few TEs)"]);
    expect(te.rank).toBeNull();
  });

  it("zero spread gives z 0, not a failure", () => {
    const flat = [p("a", "RB", { target_share: 0.1 }), p("b", "RB", { target_share: 0.1 })];
    const { rows } = scorePlayers(flat, [Z], AVAILABLE);
    expect(rows.map((r) => r.scores.z!.value)).toEqual([0, 0]);
  });
});

describe("fail closed", () => {
  it("a missing field nulls the score and names the field; nothing is imputed", () => {
    const m: Metric = { id: "m", name: "M", normalize: "none", terms: [{ field: "targets_l3", weight: 1 }] };
    const { rows } = scorePlayers(PLAYERS, [m], AVAILABLE);
    const s = rows.find((r) => r.playerId === "wr3")!.scores.m!;
    expect(s.value).toBeNull();
    expect(s.missing).toEqual(["Targets, last 3 games"]);
    expect(s.rank).toBeNull();
    // the others still rank without him
    expect(rows.find((r) => r.playerId === "wr2")!.scores.m!.rank).toBe(2);
  });

  it("an unknown field rejects the metric for everyone", () => {
    const bad: Metric = { id: "b", name: "Bad", normalize: "none", terms: [{ field: "cb_shadow", weight: 1 }] };
    const { rows, metricErrors } = scorePlayers(PLAYERS, [bad, RAW], AVAILABLE);
    expect(metricErrors.b).toEqual(["Cb shadow is not in this week's data."]);
    expect(rows.every((r) => !("b" in r.scores))).toBe(true);
    expect("1" in rows[0]!.scores).toBe(true);
  });

  it("no players gives no rows", () => {
    expect(scorePlayers([], [RAW], AVAILABLE).rows).toEqual([]);
  });
});

describe("validateMetric", () => {
  const ok = { name: "Mine", normalize: "zscore" as const, terms: [{ field: "snap_pct", weight: 1 }] };

  it("accepts a good metric", () => {
    expect(validateMetric(ok, AVAILABLE)).toEqual([]);
  });

  it("rejects empty name, long name, no terms, duplicates, zero and non-finite weights", () => {
    expect(validateMetric({ ...ok, name: "  " }, AVAILABLE)).toContain("Name is required.");
    expect(validateMetric({ ...ok, name: "x".repeat(41) }, AVAILABLE)).toContain("Name is over 40 characters.");
    expect(validateMetric({ ...ok, terms: [] }, AVAILABLE)).toContain("Add at least one field.");
    const dup = validateMetric({ ...ok, terms: [ok.terms[0]!, ok.terms[0]!] }, AVAILABLE);
    expect(dup).toContain("Snap share, recent seasons (%) appears twice.");
    expect(validateMetric({ ...ok, terms: [{ field: "snap_pct", weight: 0 }] }, AVAILABLE)).toContain(
      "Snap share, recent seasons (%) has weight 0; remove it.",
    );
    expect(validateMetric({ ...ok, terms: [{ field: "snap_pct", weight: NaN }] }, AVAILABLE)).toContain(
      "Snap share, recent seasons (%) needs a numeric weight.",
    );
  });
});
