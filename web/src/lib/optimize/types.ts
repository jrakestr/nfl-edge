export type OptPos = "QB" | "RB" | "WR" | "TE" | "DST";

export type OptPlayer = {
  player_dk_id: string;
  name: string;
  position: OptPos;
  team: string;
  opponent: string | null;
  salary: number;
  proj: number;
  value: number;
  proj_own: number | null;
};

export type FlexPos = "RB" | "WR" | "TE";

export type FlexEligible = { RB: boolean; WR: boolean; TE: boolean };

export type PosBound = { min: number; max: number };

export const DEFAULT_FLEX: FlexEligible = { RB: true, WR: true, TE: true };

export const DEFAULT_POS_BOUNDS: Record<FlexPos, PosBound> = {
  RB: { min: 2, max: 3 },
  WR: { min: 3, max: 4 },
  TE: { min: 1, max: 2 },
};

export type SolveControls = {
  lineups: number;
  salaryCap: number;
  minSalary: number;
  maxExposure: number;
  stackN: number;
  bringBack: number;
  maxPerTeam: number;
  randomness: number;
  noQbVsDst: boolean;
  flexEligible: FlexEligible;
  posBounds?: Partial<Record<FlexPos, PosBound>>;
  locks: string[];
  excludes: string[];
  stackIds: string[];
};

export const DEFAULT_CLASSIC: SolveControls = {
  lineups: 1,
  salaryCap: 50000,
  minSalary: 49200,
  maxExposure: 100,
  stackN: 0,
  bringBack: 0,
  maxPerTeam: 4,
  randomness: 0,
  noQbVsDst: true,
  flexEligible: { ...DEFAULT_FLEX },
  locks: [],
  excludes: [],
  stackIds: [],
};

export const DEFAULT_SHOWDOWN: SolveControls = {
  ...DEFAULT_CLASSIC,
  minSalary: 0,
  stackN: 0,
  bringBack: 0,
  noQbVsDst: false,
  maxPerTeam: 5,
};

export type SolvedPlayer = {
  slot: string;
  name: string;
  dk_id: string;
  team: string;
  position: string;
  proj_own: number | null;
};

export type SolvedLineup = {
  lineup_id: string;
  salary_used: number;
  proj_fpts: number;
  ownership_sum: number | null;
  stack: string | null;
  players: SolvedPlayer[];
};
