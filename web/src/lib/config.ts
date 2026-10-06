/** Season the app opens on; `?season=` overrides. */
export const CURRENT_SEASON = 2026;

/** Fallback week when no schedule week is open and no run exists. */
export const DEFAULT_WEEK = 1;

/** Sidebar collapse; `"1"` = collapsed 64px rail. */
export const SIDEBAR_COLLAPSED_KEY = "nfl-edge.sidebarCollapsed";

/** Theme: `"light"` | `"dark"`; unset follows `prefers-color-scheme`. */
export const THEME_KEY = "nfl-edge.theme";

/** Inline `<head>` script — sets `data-theme` before first paint when a choice is stored. */
export const THEME_BOOT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;

export const NAV = [
  { href: "/week", label: "Edge board", match: /^\/week(?:\/\d+)?$/, icon: "board" },
  { href: "/games", label: "Games", match: /^\/games|\/week\/\d+\/games/, icon: "games" },
  { href: "/players", label: "Players", match: /^\/players|\/week\/\d+\/players/, icon: "players" },
  { href: "/optimize", label: "Optimize", match: /^\/optimize|\/week\/\d+\/optimize/, icon: "optimize" },
  { href: "/props", label: "Props", match: /^\/props/, icon: "props" },
  { href: "/lineups", label: "Lineups", match: /^\/lineups|\/dfs\//, icon: "lineups" },
  { href: "/grading", label: "Grading", match: /^\/grading/, icon: "grading" },
  { href: "/week/1/claims", label: "Claims", match: /\/week\/\d+\/claims/, icon: "claims" },
  { href: "/league", label: "LOC league", match: /^\/league/, icon: "league" },
] as const;
