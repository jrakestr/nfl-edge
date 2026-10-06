/** Product labels for the top-bar trail. Nested week routes skip the "Edge board" prefix. */

const SITE: Record<string, string> = { dk: "DK", fd: "FD" };
const SLATE: Record<string, string> = {
  main: "Main",
  full: "Full",
  showdown: "Showdown",
};
const SECTION: Record<string, string> = {
  dfs: "Lineups",
  players: "Players",
  optimize: "Optimize",
};
const ROOT: Record<string, string> = {
  week: "Edge board",
  games: "Games",
  players: "Players",
  optimize: "Optimize",
  props: "Props",
  lineups: "Lineups",
  grading: "Grading",
  claims: "Claims",
  league: "LOC league",
};

const LEAGUE: Record<string, string> = {
  luck: "Luck",
  weeks: "Season",
  week: "Matchups",
  team: "Team",
  transactions: "Transactions",
  wire: "Wire",
  acquire: "Acquire",
};

export type Crumb = { href: string; label: string };

function titleCase(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export function crumbs(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return [];

  if (parts[0] === "league") {
    const out: Crumb[] = [{ href: "/league", label: ROOT.league! }];
    const section = parts[1];
    if (!section) return out;
    const label = LEAGUE[section] ?? decodeURIComponent(section);
    const arg = parts[2];
    if (section === "week" && arg && /^\d+$/.test(arg)) {
      out.push({ href: "/league/week", label: "Matchups" }, { href: `/league/week/${arg}`, label: `Week ${arg}` });
      return out;
    }
    if (section === "team" && arg && /^\d+$/.test(arg)) {
      out.push({ href: `/league/team/${arg}`, label: `Team ${arg}` });
      return out;
    }
    out.push({ href: `/league/${section}`, label });
    return out;
  }

  if (parts[0] === "week") {
    if (parts.length === 1) return [{ href: "/week", label: "Edge board" }];
    const week = parts[1]!;
    if (!/^\d+$/.test(week)) {
      return parts.map((p, i) => ({
        href: "/" + parts.slice(0, i + 1).join("/"),
        label: ROOT[p] ?? decodeURIComponent(p),
      }));
    }
    const out: Crumb[] = [{ href: `/week/${week}`, label: `Week ${week}` }];
    const section = parts[2];
    if (!section) return out;
    const site = parts[3];
    const slate = parts[4];
    if (section in SECTION && site && slate) {
      out.push({
        href: `/week/${week}/${section}/${site}/${slate}`,
        label: SECTION[section]!,
      });
      const siteLabel = SITE[site] ?? site.toUpperCase();
      const slateLabel = SLATE[slate] ?? titleCase(slate);
      out.push({
        href: `/week/${week}/${section}/${site}/${slate}`,
        label: `${siteLabel} ${slateLabel}`,
      });
      return out;
    }
    for (let i = 2; i < parts.length; i++) {
      const p = parts[i]!;
      out.push({
        href: "/" + parts.slice(0, i + 1).join("/"),
        label: SECTION[p] ?? ROOT[p] ?? decodeURIComponent(p),
      });
    }
    return out;
  }

  return parts.map((p, i) => ({
    href: "/" + parts.slice(0, i + 1).join("/"),
    label: ROOT[p] ?? decodeURIComponent(p),
  }));
}
