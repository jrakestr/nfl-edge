import type { WeekScoreboard as WeekScoreboardData } from "@/lib/queries/results";

function record(r: { wins: number; losses: number; pushes: number }): string {
  return `${r.wins}–${r.losses}–${r.pushes}`;
}

function mae(n: number | null): string {
  return n == null ? "—" : n.toFixed(1);
}

/** ATS / totals / MAE from model.results. Hidden until a game is final. */
export function WeekScoreboard({ board }: { board: WeekScoreboardData }) {
  if (board.nGames < 1) return null;
  return (
    <section className="card flex flex-wrap items-end gap-8 p-4" aria-label="Week scoreboard">
      <Stat label="Against the spread" value={record(board.spread)} sub={`${board.nGames} graded`} />
      <Stat label="Totals" value={record(board.total)} />
      <Stat label="Margin MAE" value={mae(board.marginMae)} />
      <Stat label="Total MAE" value={mae(board.totalMae)} />
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1" role="listitem">
      <span className="t-colhead text-muted-foreground">{label}</span>
      <span className="t-tile tnum">{value}</span>
      {sub ? <span className="t-caption">{sub}</span> : null}
    </div>
  );
}
