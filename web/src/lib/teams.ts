/**
 * Static 32-team table. The one duplicated static file in web/: mirrors config/teams.yaml
 * (city, nick, plural) plus nflverse `team_color` from load_teams() (2026-09) for the 8px dots.
 * Team colors appear only as the dot next to an abbreviation (design-system → Principles 2).
 */
export type Team = { abbr: string; city: string; nick: string; color: string };

export const TEAMS: Record<string, Team> = {
  ARI: { abbr: "ARI", city: "Arizona", nick: "Cardinals", color: "#97233F" },
  ATL: { abbr: "ATL", city: "Atlanta", nick: "Falcons", color: "#A71930" },
  BAL: { abbr: "BAL", city: "Baltimore", nick: "Ravens", color: "#241773" },
  BUF: { abbr: "BUF", city: "Buffalo", nick: "Bills", color: "#00338D" },
  CAR: { abbr: "CAR", city: "Carolina", nick: "Panthers", color: "#0085CA" },
  CHI: { abbr: "CHI", city: "Chicago", nick: "Bears", color: "#0B162A" },
  CIN: { abbr: "CIN", city: "Cincinnati", nick: "Bengals", color: "#FB4F14" },
  CLE: { abbr: "CLE", city: "Cleveland", nick: "Browns", color: "#FF3C00" },
  DAL: { abbr: "DAL", city: "Dallas", nick: "Cowboys", color: "#002244" },
  DEN: { abbr: "DEN", city: "Denver", nick: "Broncos", color: "#002244" },
  DET: { abbr: "DET", city: "Detroit", nick: "Lions", color: "#0076B6" },
  GB: { abbr: "GB", city: "Green Bay", nick: "Packers", color: "#203731" },
  HOU: { abbr: "HOU", city: "Houston", nick: "Texans", color: "#03202F" },
  IND: { abbr: "IND", city: "Indianapolis", nick: "Colts", color: "#002C5F" },
  JAX: { abbr: "JAX", city: "Jacksonville", nick: "Jaguars", color: "#006778" },
  KC: { abbr: "KC", city: "Kansas City", nick: "Chiefs", color: "#E31837" },
  LA: { abbr: "LA", city: "Los Angeles", nick: "Rams", color: "#003594" },
  LAC: { abbr: "LAC", city: "Los Angeles", nick: "Chargers", color: "#007BC7" },
  LV: { abbr: "LV", city: "Las Vegas", nick: "Raiders", color: "#000000" },
  MIA: { abbr: "MIA", city: "Miami", nick: "Dolphins", color: "#008E97" },
  MIN: { abbr: "MIN", city: "Minnesota", nick: "Vikings", color: "#4F2683" },
  NE: { abbr: "NE", city: "New England", nick: "Patriots", color: "#002244" },
  NO: { abbr: "NO", city: "New Orleans", nick: "Saints", color: "#D3BC8D" },
  NYG: { abbr: "NYG", city: "New York", nick: "Giants", color: "#0B2265" },
  NYJ: { abbr: "NYJ", city: "New York", nick: "Jets", color: "#003F2D" },
  PHI: { abbr: "PHI", city: "Philadelphia", nick: "Eagles", color: "#004C54" },
  PIT: { abbr: "PIT", city: "Pittsburgh", nick: "Steelers", color: "#000000" },
  SEA: { abbr: "SEA", city: "Seattle", nick: "Seahawks", color: "#002244" },
  SF: { abbr: "SF", city: "San Francisco", nick: "49ers", color: "#AA0000" },
  TB: { abbr: "TB", city: "Tampa Bay", nick: "Buccaneers", color: "#A71930" },
  TEN: { abbr: "TEN", city: "Tennessee", nick: "Titans", color: "#4495D2" },
  WAS: { abbr: "WAS", city: "Washington", nick: "Commanders", color: "#5A1414" },
};

export function team(abbr: string): Team {
  return TEAMS[abbr] ?? { abbr, city: abbr, nick: abbr, color: "#6F7683" };
}

/** Kickoff slot from ET time and weekday (design-system filters: main/early/late/primetime). */
export type Slot = "early" | "late" | "primetime" | "other";

export function slot(gameday: string, gametime: string | null): Slot {
  if (!gametime) return "other";
  const [hh] = gametime.split(":").map(Number);
  const dow = new Date(`${gameday}T12:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
  if (dow !== 0) return "primetime"; // Thu/Mon/Sat games
  if (hh < 15) return "early";
  if (hh < 19) return "late";
  return "primetime";
}
