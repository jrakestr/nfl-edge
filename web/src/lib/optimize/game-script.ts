import { teamOpponents } from "./pool";
import type { OptPlayer, SolveControls } from "./types";

/**
 * Hand-built game script presets per game or per team:
 *
 *Classic (`game_id`):
 * - `shootout`: Primary game stack — forces the QB from `scriptTeam` (or either team in that game)
 *   + 2 same-team pass catchers + 1 opposing pass catcher/RB, and tilts both teams toward their
 *   upside (p90) while penalizing both DSTs in that game.
 * - `control`: Game-control / blowout script for `scriptTeam` — forces `scriptTeam` RB + `scriptTeam` DST
 *   (or boosts them + penalizes opposing pass game when soft), tilting `scriptTeam` rushing/defense
 *   and the trailing opponent's passing catch-up.
 * - `grind`: Low-event defensive slugfest — caps total players from this game to <= 2, excludes QBs
 *   from this game, and tilts RBs/DSTs toward floor/upside while fading WRs.
 * - `fade`: Full game fade — caps non-DST players from this game to 0 (or excludes everyone not locked).
 *
 * Showdown (`showdownScript`):
 * - `shootout`: 3–3 or 4–2 passing duel — forces both QBs (or 1 QB + pass catchers on both sides),
 *   excludes DSTs from Captain, and tilts pass catchers toward p90 ceiling.
 * - `home_control` / `away_control`: Leading team (`home` or `away`) scripts a 4–2 or 5–1 onslaught —
 *   forces ≥ 4 players from the leading team, boosts leading RB + DST + K, and tilts trailing team's
 *   pass catchers (WR/TE) over trailing RBs.
 * - `defensive`: Low-scoring field-position battle — boosts RBs, DSTs, and Kickers into the core and
 *   penalizes WR3/4 ceiling darts.
 */
export type GameScriptKind = "shootout" | "control" | "grind" | "fade";

export type ShowdownScriptKind = "shootout" | "home_control" | "away_control" | "defensive";

export type GameStance = {
  gameId: string;
  script: GameScriptKind;
  /** For `shootout` (which QB leads the stack, optional) or `control` (which team controls the game). */
  team?: string | null;
};

export type SlateGameContext = {
  gameId: string;
  away: string;
  home: string;
  kickoff: string | null;
  marketSpread: number | null;
  marketTotal: number | null;
  fairSpread: number | null;
  fairTotal: number | null;
};

export const GAME_SCRIPT_LABEL: Record<GameScriptKind, string> = {
  shootout: "Shootout stack",
  control: "Control (RB + DST)",
  grind: "Defensive grind",
  fade: "Fade game",
};

export const SHOWDOWN_SCRIPT_LABEL: Record<ShowdownScriptKind, string> = {
  shootout: "Shootout (pass-heavy 3–3 / 4–2)",
  away_control: "Away control (4–2 / 5–1)",
  home_control: "Home control (4–2 / 5–1)",
  defensive: "Defensive / RB & K grind",
};

/** Build one row per game on the slate from the player pool + optional board fair lines. */
export function slateGamesFromPool(
  players: OptPlayer[],
  fairByGame: Record<string, { fairSpread: number | null; fairTotal: number | null }> = {},
): SlateGameContext[] {
  const byGame = new Map<string, SlateGameContext>();
  for (const p of players) {
    const gid = p.game_id;
    if (!gid || byGame.has(gid)) continue;
    const parts = gid.split("_");
    const away = p.homeAway === "away" ? p.team : (p.opponent ?? parts[2] ?? "");
    const home = p.homeAway === "home" ? p.team : (p.opponent ?? parts[3] ?? "");
    const fair = fairByGame[gid];
    byGame.set(gid, {
      gameId: gid,
      away,
      home,
      kickoff: p.gameday && p.gametime ? `${p.gameday} ${p.gametime}` : p.gameday ?? null,
      marketSpread: p.marketSpread ?? null,
      marketTotal: p.marketTotal ?? null,
      fairSpread: fair?.fairSpread ?? null,
      fairTotal: fair?.fairTotal ?? null,
    });
  }
  return [...byGame.values()].sort((a, b) => (a.kickoff ?? a.gameId).localeCompare(b.kickoff ?? b.gameId));
}

/** Suggest a default script from model vs market when the user clicks "Suggest from sim". */
export function suggestGameStance(g: SlateGameContext): GameStance | null {
  const total = g.fairTotal ?? g.marketTotal;
  const spread = g.fairSpread ?? g.marketSpread;
  if (total != null && total >= 47.5) {
    // Shootout: pick the team with higher implied total or slight underdog to lead
    const favoredHome = spread != null ? spread > 0 : true;
    return { gameId: g.gameId, script: "shootout", team: favoredHome ? g.home : g.away };
  }
  if (spread != null && Math.abs(spread) >= 6.5) {
    const leader = spread > 0 ? g.home : g.away;
    return { gameId: g.gameId, script: "control", team: leader };
  }
  if (total != null && total <= 40.5) {
    return { gameId: g.gameId, script: "grind", team: null };
  }
  return null;
}

/**
 * Scenario-conditional projection adjustment for a player under active game scripts.
 *
 * Instead of treating every player's mean as independent, a game script shifts each player
 * along his own simulated distribution (`p25` floor <-> `proj` mean <-> `p90` ceiling) according
 * to the script's causal story:
 * - In a `shootout`, QBs and pass catchers (WR/TE) move toward their 90th-percentile draw (+35% of
 *   their ceiling gap), RBs get a modest pass-game bump (+15%), and DSTs in that game are pushed
 *   toward their 25th-percentile floor.
 * - In `control` for `team`, the controlling team's RBs and DST move toward their 90th-percentile
 *   draw (+35% of ceiling gap) while the trailing opponent's RBs are pushed toward `p25` floor and
 *   trailing WR/TEs get a garbage-time catch-up bump (+15% of ceiling gap).
 * - In `grind`, DSTs and RBs in that game get +25% of ceiling gap while QBs/WRs are pushed toward `p25`.
 */
/**
 * Ceiling/floor gaps for a script tilt. p25/p90 are sim quantiles around the sim mean
 * (`simProj`). When `proj` is another source (Adjusted, FantasyPros, Yours) the sim's
 * shape is kept and rescaled to that center, so a player the source likes more gets a
 * proportionally larger gap, never a smaller one. Under DK pts `proj === simProj` and
 * this is the plain p90 − proj / proj − p25.
 */
export function scriptGaps(p: OptPlayer): { ceilGap: number; floorGap: number } {
  const center = p.simProj != null && p.simProj > 0 ? p.simProj : p.proj;
  const scale = center > 0 ? p.proj / center : 1;
  const ceilGap = p.p90 != null && p.p90 > center ? (p.p90 - center) * scale : p.proj * 0.25;
  const floorGap = p.p25 != null && center > p.p25 ? (center - p.p25) * scale : p.proj * 0.2;
  return { ceilGap, floorGap };
}

export function scriptAdjustedObjective(
  p: OptPlayer,
  baseObj: number,
  controls: SolveControls,
  showdown: boolean,
): number {
  const { ceilGap, floorGap } = scriptGaps(p);

  if (showdown) {
    const sd = controls.showdownScript;
    if (!sd) return baseObj;
    if (sd === "shootout") {
      if (p.position === "QB" || p.position === "WR" || p.position === "TE") return baseObj + 0.35 * ceilGap;
      if (p.position === "DST") return Math.max(0, baseObj - 0.5 * floorGap);
      return baseObj;
    }
    if (sd === "defensive") {
      if (p.position === "DST" || p.position === "RB") return baseObj + 0.35 * ceilGap;
      if (p.position === "QB" || p.position === "WR") return Math.max(0, baseObj - 0.25 * floorGap);
      return baseObj;
    }
    if (sd === "home_control" || sd === "away_control") {
      const leadSide = sd === "home_control" ? "home" : "away";
      const isLead = p.homeAway === leadSide;
      if (isLead) {
        if (p.position === "RB" || p.position === "DST") return baseObj + 0.35 * ceilGap;
        if (p.position === "QB" || p.position === "WR" || p.position === "TE") return baseObj + 0.15 * ceilGap;
      } else {
        if (p.position === "RB" || p.position === "DST") return Math.max(0, baseObj - 0.45 * floorGap);
        if (p.position === "WR" || p.position === "TE") return baseObj + 0.2 * ceilGap;
      }
      return baseObj;
    }
    return baseObj;
  }

  const stances = controls.gameScripts ?? [];
  if (!stances.length || !p.game_id) return baseObj;
  const stance = stances.find((s) => s.gameId === p.game_id);
  if (!stance) return baseObj;

  if (stance.script === "shootout") {
    const isFocusTeam = !stance.team || p.team === stance.team;
    if (p.position === "QB") return isFocusTeam ? baseObj + 0.4 * ceilGap : baseObj + 0.25 * ceilGap;
    if (p.position === "WR" || p.position === "TE") {
      return isFocusTeam ? baseObj + 0.35 * ceilGap : baseObj + 0.25 * ceilGap;
    }
    if (p.position === "RB") return baseObj + 0.1 * ceilGap;
    if (p.position === "DST") return Math.max(0, baseObj - 0.6 * floorGap);
  }

  if (stance.script === "control") {
    const opp = teamOpponents([p]).get(p.team) ?? p.opponent;
    const leadTeam = stance.team || p.team;
    const isLead = p.team === leadTeam;
    const isTrail = opp === leadTeam || (!isLead && stance.team != null);
    if (isLead) {
      if (p.position === "RB" || p.position === "DST") return baseObj + 0.4 * ceilGap;
      if (p.position === "QB") return Math.max(0, baseObj - 0.15 * floorGap);
    } else if (isTrail) {
      if (p.position === "RB" || p.position === "DST") return Math.max(0, baseObj - 0.5 * floorGap);
      if (p.position === "WR" || p.position === "TE") return baseObj + 0.2 * ceilGap;
    }
  }

  if (stance.script === "grind") {
    if (p.position === "DST" || p.position === "RB") return baseObj + 0.25 * ceilGap;
    if (p.position === "QB" || p.position === "WR") return Math.max(0, baseObj - 0.4 * floorGap);
  }

  if (stance.script === "fade") {
    return Math.max(0, baseObj - 0.8 * floorGap);
  }

  return baseObj;
}

/** Human-readable summary of what the active game scripts enforce in the MILP. */
export function describeActiveScripts(controls: SolveControls, showdown: boolean): string[] {
  if (showdown) {
    const sd = controls.showdownScript;
    if (!sd) return [];
    if (sd === "shootout") {
      return [
        "Shootout script: requires ≥ 1 QB, ≥ 3 pass catchers (WR/TE), blocks DST from Captain, and tilts pass game toward p90 ceiling.",
      ];
    }
    if (sd === "away_control") {
      return [
        "Away control script: requires 4–5 Away players, boosts Away RB/DST toward ceiling, and limits Home to pass-game bring-backs.",
      ];
    }
    if (sd === "home_control") {
      return [
        "Home control script: requires 4–5 Home players, boosts Home RB/DST toward ceiling, and limits Away to pass-game bring-backs.",
      ];
    }
    if (sd === "defensive") {
      return [
        "Defensive grind script: requires ≥ 1 RB or DST, caps total WRs at ≤ 3, and tilts RBs/DSTs toward ceiling.",
      ];
    }
    return [];
  }

  const out: string[] = [];
  for (const s of controls.gameScripts ?? []) {
    const label = s.gameId.split("_").slice(2).join(" @ ");
    if (s.script === "shootout") {
      const who = s.team ? `${s.team} QB` : `${label} QB`;
      out.push(
        `${label} Shootout: locks ${who} + ≥ 2 same-team WR/TE + ≥ 1 bring-back, blocks both DSTs, and tilts pass catchers toward p90.`,
      );
    } else if (s.script === "control") {
      const who = s.team ?? label;
      out.push(
        `${label} Control (${who}): requires ≥ 1 ${who} RB, blocks ${who}'s opposing RB, boosts ${who} RB + DST toward p90, and tilts trailing WR/TE catch-up.`,
      );
    } else if (s.script === "grind") {
      out.push(
        `${label} Grind: caps game at ≤ 2 players, excludes QBs from ${label}, and tilts RBs/DSTs over WRs.`,
      );
    } else if (s.script === "fade") {
      out.push(`${label} Fade: excludes all unlocked offensive players from ${label}.`);
    }
  }
  return out;
}
