/** Display types for /grading. SQL-free so client islands can import them. */

export type Wlp = { wins: number; losses: number; pushes: number };

export type GradedGame = {
  gameId: string;
  week: number;
  runId: string;
  home: string;
  away: string;
  gameday: string;
  gametime: string | null;
  homeScore: number | null;
  awayScore: number | null;
  result: number | null;
  scoreTotal: number | null;
  meanSpread: number | null;
  meanTotal: number | null;
  homeWinProb: number | null;
  spreadLine: number | null;
  spreadModelProb: number | null;
  spreadMarketProb: number | null;
  spreadEdge: number | null;
  /** Last-snapshot spread side with edge > 0. */
  spreadHasPick: boolean;
  /** Outcome of that pick, not the home side. */
  spreadOutcome: number | null;
  /** First bet-able snapshot CLV; null when that snapshot is the close. */
  spreadClvPoints: number | null;
  spreadVerdictCall: string | null;
  totalLine: number | null;
  totalModelProb: number | null;
  totalMarketProb: number | null;
  totalEdge: number | null;
  totalHasPick: boolean;
  totalOutcome: number | null;
  totalClvPoints: number | null;
  mlModelProb: number | null;
  mlMarketProb: number | null;
  mlEdge: number | null;
  mlOutcome: number | null;
  homeSpreadOdds: number | null;
  awaySpreadOdds: number | null;
  snapshotCount: number;
};

export type CalBucket = {
  lo: number;
  hi: number;
  n: number;
  hitRate: number | null;
};
