import type { GradedGame } from "@/lib/grade-types";
import { gameFlags, type GameFlags } from "@/lib/margin-accuracy";

/** One raw.external_games row (source nflgamesim). SQL-free so the page and tests can share it. */
export type SiteGame = {
  gameId: string;
  week: number;
  home: string;
  away: string;
  gameday: string;
  gametime: string | null;
  status: string;
  /** Site's mean margin, home minus away. */
  simMarginHome: number | null;
  simPHomeWin: number | null;
  pickResult: string | null;
  marginWithin7: string | null;
  atsResult: string | null;
  actualMarginHome: number | null;
};

export type Metric = { right: number; n: number };
export type Tally = { pick: Metric; within7: Metric; ats: Metric & { pushes: number } };

export type GameCompare = {
  gameId: string;
  week: number;
  home: string;
  away: string;
  gameday: string;
  gametime: string | null;
  actualMarginHome: number | null;
  siteMargin: number | null;
  ourMargin: number | null;
  site: GameFlags;
  /** Null when no run predates kickoff, so the game was never graded on our side. */
  ours: GameFlags | null;
};

export type SiteCompare = {
  /** Every finished site game, like the site's own summary. */
  site: Tally;
  /** Our graded games only. */
  ours: Tally;
  /** The site, restricted to the games we graded. */
  siteSame: Tally;
  games: GameCompare[];
  /** Finished site games we have no graded run for. */
  ungraded: number;
};

function siteFlags(s: SiteGame): GameFlags | null {
  if (s.status !== "final") return null;
  const pick = s.pickResult === "correct" ? "right" : s.pickResult === "incorrect" ? "wrong" : "push";
  const ats =
    s.atsResult === "correct" ? "hit" : s.atsResult === "incorrect" ? "miss" : s.atsResult === "push" ? "push" : null;
  return { pick, within7: s.marginWithin7 === "yes", ats };
}

function tally(flags: GameFlags[]): Tally {
  const t: Tally = {
    pick: { right: 0, n: 0 },
    within7: { right: 0, n: 0 },
    ats: { right: 0, n: 0, pushes: 0 },
  };
  for (const f of flags) {
    t.pick.n += 1;
    if (f.pick === "right") t.pick.right += 1;
    t.within7.n += 1;
    if (f.within7) t.within7.right += 1;
    if (f.ats != null) {
      t.ats.n += 1;
      if (f.ats === "hit") t.ats.right += 1;
      if (f.ats === "push") t.ats.pushes += 1;
    }
  }
  return t;
}

/**
 * Our three NFLGameSim-page metrics next to the site's, per game and in total. `week` null is the
 * whole season. A finished site game with no graded run on our side stays in the site totals and
 * shows with a null `ours`; `siteSame` is the like-for-like figure.
 */
export function compareWithSite(
  ours: GradedGame[],
  site: SiteGame[],
  week: number | null,
): SiteCompare {
  const mine = new Map(ours.map((g) => [g.gameId, g]));
  const games: GameCompare[] = [];
  for (const s of site) {
    if (week != null && s.week !== week) continue;
    const sf = siteFlags(s);
    if (!sf) continue;
    const o = mine.get(s.gameId);
    games.push({
      gameId: s.gameId,
      week: s.week,
      home: s.home,
      away: s.away,
      gameday: s.gameday,
      gametime: s.gametime,
      actualMarginHome: s.actualMarginHome,
      siteMargin: s.simMarginHome,
      ourMargin: o?.meanSpread ?? null,
      site: sf,
      ours: o ? gameFlags(o) : null,
    });
  }
  games.sort((a, b) => a.week - b.week || a.gameday.localeCompare(b.gameday) || (a.gametime ?? "").localeCompare(b.gametime ?? "") || a.gameId.localeCompare(b.gameId));
  const graded = games.filter((g) => g.ours != null);
  return {
    site: tally(games.map((g) => g.site)),
    ours: tally(graded.map((g) => g.ours as GameFlags)),
    siteSame: tally(graded.map((g) => g.site)),
    games,
    ungraded: games.length - graded.length,
  };
}
