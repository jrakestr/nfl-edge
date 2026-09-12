/** Season the app opens on; `?season=` overrides. */
export const CURRENT_SEASON = 2026;

/** Fallback week when no run exists yet for the season. */
export const DEFAULT_WEEK = 1;

/** Sidebar collapse; `"1"` = collapsed 64px rail. */
export const SIDEBAR_COLLAPSED_KEY = "nfl-edge.sidebarCollapsed";

export const NAV = [
  { href: "/week", label: "Edge board", match: /^\/week(?:\/\d+)?$/, icon: "board" },
  { href: "/games", label: "Games", match: /^\/games|\/week\/\d+\/games/, icon: "games" },
  { href: "/players", label: "Players", match: /^\/players|\/week\/\d+\/players/, icon: "players" },
  { href: "/optimize", label: "Optimize", match: /^\/optimize|\/week\/\d+\/optimize/, icon: "optimize" },
  { href: "/props", label: "Props", match: /^\/props/, icon: "props" },
  { href: "/lineups", label: "Lineups", match: /^\/lineups|\/dfs\//, icon: "lineups" },
  { href: "/grading", label: "Grading", match: /^\/grading/, icon: "grading" },
] as const;
