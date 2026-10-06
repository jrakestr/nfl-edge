import type { GradedGame } from "@/lib/grade-types";

export type ErrorPair = {
  /** Mean absolute error of our number. */
  model: number;
  /** Mean absolute error of the book's number on the same games. */
  book: number;
  /** Games where both numbers and the final exist. */
  n: number;
};

export type Count = { right: number; n: number };

export type MarginAccuracy = {
  margin: ErrorPair | null;
  total: ErrorPair | null;
  /** NFLGameSim "Pick Accuracy": the side we gave over 50% to won outright. A tie is a miss. */
  pick: Count;
  /** NFLGameSim "Final Margin within 7 Pts": |our mean margin - actual margin| <= 7. */
  within7: Count;
  /** NFLGameSim "Beat the Spread": the side our mean margin leans to covered. A push is a miss, counted apart. */
  ats: Count & { pushes: number };
  /** Mean of (our margin - actual margin); positive means we lean too far toward home. */
  bias: number | null;
};

function pair(rows: { model: number; book: number; actual: number }[]): ErrorPair | null {
  if (rows.length === 0) return null;
  const n = rows.length;
  return {
    model: rows.reduce((s, r) => s + Math.abs(r.actual - r.model), 0) / n,
    book: rows.reduce((s, r) => s + Math.abs(r.actual - r.book), 0) / n,
    n,
  };
}

export type GameFlags = {
  /** The side we gave over 50% to won outright; a tie is a push. */
  pick: "right" | "wrong" | "push";
  /** |our mean margin - actual margin| <= 7. */
  within7: boolean;
  /** The side our mean margin leans to covered the book spread; null with no book line. */
  ats: "hit" | "miss" | "push" | null;
};

/** The three NFLGameSim page flags for one finished game. Null with no final or no mean margin. */
export function gameFlags(g: GradedGame): GameFlags | null {
  if (g.result == null || g.meanSpread == null) return null;
  const homeP = g.homeWinProb ?? (g.meanSpread === 0 ? 0.5 : g.meanSpread > 0 ? 1 : 0);
  const pick: GameFlags["pick"] =
    g.result === 0
      ? "push"
      : (homeP > 0.5 && g.result > 0) || (homeP < 0.5 && g.result < 0)
        ? "right"
        : "wrong";
  let ats: GameFlags["ats"] = null;
  if (g.spreadLine != null) {
    const lean = g.meanSpread - g.spreadLine;
    const cover = Math.round((g.result - g.spreadLine) * 10) / 10;
    ats = cover === 0 ? "push" : (lean > 0 && cover > 0) || (lean < 0 && cover < 0) ? "hit" : "miss";
  }
  return { pick, within7: Math.abs(g.meanSpread - g.result) <= 7 + 1e-9, ats };
}

/**
 * Margin and total accuracy over every graded game with a final score, not just the bets.
 * meanSpread and spreadLine are both home-margin scale (positive = home wins), the same
 * scale as result. The pick / within-7 / ATS counts follow the NFLGameSim page definitions
 * (see apply_actuals in benchmark/nflgamesim.py) so the two can be read side by side.
 */
export function marginAccuracy(games: GradedGame[]): MarginAccuracy {
  const margins: { model: number; book: number; actual: number }[] = [];
  const totals: { model: number; book: number; actual: number }[] = [];
  const pick: Count = { right: 0, n: 0 };
  const within7: Count = { right: 0, n: 0 };
  const ats = { right: 0, n: 0, pushes: 0 };
  let biasSum = 0;
  let biasN = 0;
  for (const g of games) {
    if (g.result == null) continue;
    const f = gameFlags(g);
    if (f && g.meanSpread != null) {
      biasSum += g.meanSpread - g.result;
      biasN += 1;
      pick.n += 1;
      if (f.pick === "right") pick.right += 1;
      within7.n += 1;
      if (f.within7) within7.right += 1;
      if (f.ats != null && g.spreadLine != null) {
        margins.push({ model: g.meanSpread, book: g.spreadLine, actual: g.result });
        ats.n += 1;
        if (f.ats === "hit") ats.right += 1;
        if (f.ats === "push") ats.pushes += 1;
      }
    }
    if (g.scoreTotal != null && g.meanTotal != null && g.totalLine != null) {
      totals.push({ model: g.meanTotal, book: g.totalLine, actual: g.scoreTotal });
    }
  }
  return {
    margin: pair(margins),
    total: pair(totals),
    pick,
    within7,
    ats,
    bias: biasN === 0 ? null : biasSum / biasN,
  };
}
