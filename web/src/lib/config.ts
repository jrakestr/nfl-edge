/** Season the app opens on; `?season=` overrides. */
export const CURRENT_SEASON = 2026;

/** Fallback week when no run exists yet for the season. */
export const DEFAULT_WEEK = 1;

export const NAV = [
  { href: "/week", label: "Edge board", match: /^\/week/ },
  { href: "/games", label: "Games", match: /^\/games/ },
  { href: "/players", label: "Players", match: /^\/players/ },
  { href: "/props", label: "Props", match: /^\/props/ },
  { href: "/lineups", label: "Lineups", match: /^\/lineups/ },
  { href: "/grading", label: "Grading", match: /^\/grading/ },
] as const;
