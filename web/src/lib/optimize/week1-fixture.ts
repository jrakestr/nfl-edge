import type { SlatePlayer } from "@/lib/types";

const GAME = "NO@DET 09/07/2026 01:00PM ET";
const PHI = "GB@PHI 09/07/2026 01:00PM ET";
const CIN = "CLE@CIN 09/07/2026 01:00PM ET";
const SF = "SEA@SF 09/07/2026 04:05PM ET";
const MIN = "CHI@MIN 09/07/2026 01:00PM ET";
const ATL = "TB@ATL 09/07/2026 01:00PM ET";

function p(
  player_id: string,
  dk_id: string,
  display_name: string,
  position: string,
  team: string,
  salary: number,
  fpts: number,
  game_info: string,
): SlatePlayer {
  return {
    player_id,
    dk_id,
    display_name,
    position,
    team,
    salary,
    game_info,
    game_id: `${team}-game`,
    fpts_dk_mean: fpts,
    fpts_dk_sd: 4,
    typical_dk: fpts,
  };
}

/** Week 1-shaped DET@NO plus fillers. IDs are the slate DK IDs. */
export const DET_NO_SLATE: SlatePlayer[] = [
  p("goff", "43791001", "Jared Goff", "QB", "DET", 6200, 18.4, GAME),
  p("gibbs", "43791002", "Jahmyr Gibbs", "RB", "DET", 7800, 21.8, GAME),
  p("monty", "43791003", "David Montgomery", "RB", "DET", 5600, 13.2, GAME),
  p("stbrown", "43791004", "Amon-Ra St. Brown", "WR", "DET", 7400, 19.6, GAME),
  p("jamo", "43791005", "Jameson Williams", "WR", "DET", 4900, 12.4, GAME),
  p("laporta", "43791006", "Sam LaPorta", "TE", "DET", 4800, 11.8, GAME),
  p("teslaa", "43791007", "Isaac TeSlaa", "WR", "DET", 3100, 6.2, GAME),
  p("wright", "43791008", "Brock Wright", "TE", "DET", 2600, 5.4, GAME),
  p("lions", "43791009", "Lions", "DST", "DET", 2400, 7.1, GAME),
  p("rattler", "43791010", "Spencer Rattler", "QB", "NO", 5100, 14.1, GAME),
  p("kamara", "43791011", "Alvin Kamara", "RB", "NO", 6400, 15.8, GAME),
  p("olave", "43791012", "Chris Olave", "WR", "NO", 5600, 14.6, GAME),
  p("shaheed", "43791013", "Rashid Shaheed", "WR", "NO", 4100, 10.4, GAME),
  p("johnson", "43791014", "Juwan Johnson", "TE", "NO", 3500, 8.1, GAME),
  p("miller", "43791015", "Kendre Miller", "RB", "NO", 3900, 7.6, GAME),
  p("saints", "43791016", "Saints", "DST", "NO", 2500, 6.4, GAME),
  p("bijan", "43791020", "Bijan Robinson", "RB", "ATL", 6300, 18.2, ATL),
  p("saquon", "43791021", "Saquon Barkley", "RB", "PHI", 7000, 19.4, PHI),
  p("chase", "43791022", "Ja'Marr Chase", "WR", "CIN", 6900, 20.1, CIN),
  p("jefferson", "43791023", "Justin Jefferson", "WR", "MIN", 6700, 18.7, MIN),
  p("aiyuk", "43791024", "Brandon Aiyuk", "WR", "SF", 4800, 12.1, SF),
  p("kittle", "43791025", "George Kittle", "TE", "SF", 4500, 11.2, SF),
  p("hock", "43791026", "T.J. Hockenson", "TE", "MIN", 4000, 9.4, MIN),
  p("eagles", "43791030", "Eagles", "DST", "PHI", 2900, 8.0, PHI),
  p("packers", "43791031", "Packers", "DST", "GB", 2700, 7.4, "GB@PHI 09/07/2026 01:00PM ET"),
  p("niners", "43791032", "49ers", "DST", "SF", 2800, 7.8, SF),
];

export const CHECKPOINT_B = {
  locked: ["gibbs", "stbrown"],
  excluded: ["monty"],
  stacked: [] as string[],
  qbStackTeam: "DET",
  bringBackTeam: "NO",
  randomness: 20,
  maxExposure: 0.8,
  nLineups: 5,
  seed: 7,
};

export function fixtureCsv(players: SlatePlayer[]): string {
  const header = "Position,Name + ID,Name,ID,Roster Position,Salary,Game Info,TeamAbbrev,AvgPointsPerGame";
  const rows = players.map((p) =>
    [
      p.position,
      `${p.display_name} (${p.dk_id})`,
      p.display_name,
      p.dk_id,
      p.position === "DST" ? "DST" : `${p.position}/FLEX`,
      p.salary,
      p.game_info,
      p.team,
      p.typical_dk,
    ].join(","),
  );
  return [header, ...rows].join("\n") + "\n";
}
