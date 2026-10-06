"use client";

import { Matchup } from "@/components/board/TeamDot";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { signed } from "@/lib/edge";
import type { GameFlags } from "@/lib/margin-accuracy";
import type { GameCompare, Metric, SiteCompare } from "@/lib/ngs-compare";
import { cn } from "@/lib/utils";

const PICK = { right: "Right", wrong: "Wrong", push: "Tie" } as const;
const ATS = { hit: "Hit", miss: "Miss", push: "Push" } as const;

function frac(m: Metric): number | null {
  return m.n === 0 ? null : m.right / m.n;
}

function pct(m: Metric): string {
  const f = frac(m);
  return f == null ? "—" : `${(f * 100).toFixed(1)}%`;
}

function of(m: Metric): string {
  return m.n === 0 ? "" : `${m.right} of ${m.n} games`;
}

/** Team and points for a home-minus-away margin: "GB 3.4". */
function lean(home: string, away: string, margin: number | null): string {
  if (margin == null) return "—";
  if (margin === 0) return "Even";
  return `${margin > 0 ? home : away} ${Math.abs(margin).toFixed(1)}`;
}

function Gap({ ours, base }: { ours: Metric; base: Metric }) {
  const a = frac(ours);
  const b = frac(base);
  if (a == null || b == null) return <span className="t-body tnum">—</span>;
  const gap = (a - b) * 100;
  const flat = Math.abs(gap) < 0.05;
  return (
    <span
      className={cn(
        "t-body tnum font-semibold",
        flat ? "text-edge-flat" : gap > 0 ? "text-edge-pos" : "text-edge-neg",
      )}
    >
      {signed(gap)} pts
    </span>
  );
}

function Cell({ m }: { m: Metric }) {
  return (
    <span className="flex flex-col items-end gap-0.5">
      <span className="t-body tnum font-semibold">{pct(m)}</span>
      <span className="t-caption">{of(m)}</span>
    </span>
  );
}

function Pair({ ours, site }: { ours: string | null; site: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="t-body">
        <span className="t-caption text-muted-foreground">Ours </span>
        {ours ?? "—"}
      </span>
      <span className="t-body">
        <span className="t-caption text-muted-foreground">Site </span>
        {site}
      </span>
    </span>
  );
}

function flagText(f: GameFlags | null, key: "pick" | "within7" | "ats"): string | null {
  if (!f) return null;
  if (key === "pick") return PICK[f.pick];
  if (key === "within7") return f.within7 ? "Yes" : "No";
  return f.ats == null ? "—" : ATS[f.ats];
}

const COLUMNS: DataColumn<GameCompare>[] = [
  {
    id: "matchup",
    header: "Matchup",
    sortValue: (g) => `${g.week} ${g.away} ${g.home}`,
    cell: (g) => (
      <div className="flex flex-col gap-0.5">
        <Matchup home={g.home} away={g.away} />
        <span className="t-caption">Week {g.week}</span>
      </div>
    ),
  },
  {
    id: "pickside",
    header: "Who wins",
    sortable: false,
    cell: (g) =>
      g.ours ? (
        <Pair ours={lean(g.home, g.away, g.ourMargin)} site={lean(g.home, g.away, g.siteMargin)} />
      ) : (
        <span className="flex flex-col gap-0.5">
          <span className="t-body">
            <span className="t-caption text-muted-foreground">Site </span>
            {lean(g.home, g.away, g.siteMargin)}
          </span>
          <span className="t-caption">Not graded on our side</span>
        </span>
      ),
  },
  {
    id: "final",
    header: "Final",
    sortValue: (g) => g.actualMarginHome,
    cell: (g) => <span className="t-body tnum">{lean(g.home, g.away, g.actualMarginHome)}</span>,
  },
  {
    id: "pick",
    header: "Pick",
    sortable: false,
    cell: (g) => <Pair ours={flagText(g.ours, "pick")} site={flagText(g.site, "pick") ?? "—"} />,
  },
  {
    id: "within7",
    header: "Margin within 7",
    sortable: false,
    cell: (g) => <Pair ours={flagText(g.ours, "within7")} site={flagText(g.site, "within7") ?? "—"} />,
  },
  {
    id: "ats",
    header: "Beat the spread",
    sortable: false,
    cell: (g) => <Pair ours={flagText(g.ours, "ats")} site={flagText(g.site, "ats") ?? "—"} />,
  },
];

const ROWS = [
  { key: "pick", label: "Pick accuracy" },
  { key: "within7", label: "Margin within 7 pts" },
  { key: "ats", label: "Beat the spread" },
] as const;

export function NgsCompare({ compare, week }: { compare: SiteCompare; week: number | null }) {
  const scope = week == null ? "all weeks" : `week ${week}`;
  if (compare.games.length === 0) {
    return (
      <section className="card p-4" aria-label="Compared with NFLGameSim">
        <h2 className="t-body font-semibold">Compared with NFLGameSim</h2>
        <p className="mt-2 t-caption">
          No finished NFLGameSim games for {scope}. Paste the page into docs/nflgamesim-weekN.md and
          run nfl-edge benchmark nflgamesim --season 2026 --file docs/nflgamesim-weekN.md.
        </p>
      </section>
    );
  }
  const like = compare.ungraded > 0;
  return (
    <div className="flex flex-col gap-4" aria-label="Compared with NFLGameSim">
      <section className="card p-4">
        <h2 className="t-body font-semibold">Compared with NFLGameSim</h2>
        <p className="mt-1 t-caption">
          The site&apos;s three measures over every finished game, {scope}, not only the bets.
          {like
            ? ` ${compare.ungraded} finished game${compare.ungraded === 1 ? " is" : "s are"} not graded on our side (no run before kickoff, or the week is not graded yet); the gap uses the site on the same games.`
            : ""}
        </p>
        <table className="mt-3 w-full" aria-label="Ours against the site">
          <thead>
            <tr className="border-b border-border">
              <th className="t-colhead px-3 py-2 text-left text-muted-foreground">Measure</th>
              <th className="t-colhead px-3 py-2 text-right text-muted-foreground">Ours</th>
              <th className="t-colhead px-3 py-2 text-right text-muted-foreground">Site</th>
              {like ? (
                <th className="t-colhead px-3 py-2 text-right text-muted-foreground">
                  Site, same games
                </th>
              ) : null}
              <th className="t-colhead px-3 py-2 text-right text-muted-foreground">Gap</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ key, label }) => (
              <tr key={key} className="border-b border-border-soft">
                <td className="t-body px-3 py-2">{label}</td>
                <td className="px-3 py-2">
                  <Cell m={compare.ours[key]} />
                </td>
                <td className="px-3 py-2">
                  <Cell m={compare.site[key]} />
                </td>
                {like ? (
                  <td className="px-3 py-2">
                    <Cell m={compare.siteSame[key]} />
                  </td>
                ) : null}
                <td className="px-3 py-2 text-right">
                  <Gap ours={compare.ours[key]} base={like ? compare.siteSame[key] : compare.site[key]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <DataTable
        data={compare.games}
        columns={COLUMNS}
        getRowId={(g) => g.gameId}
        empty="No finished NFLGameSim games"
        ariaLabel="NFLGameSim game by game"
        syncUrl={false}
      />
    </div>
  );
}
