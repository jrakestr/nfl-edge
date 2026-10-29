import { STRONG, homeLine, line } from "@/lib/edge";
import type { BoardRow, EdgeSide, GameChecks } from "@/lib/types";

export type Bet = {
  gameId: string;
  away: string;
  home: string;
  gameday: string;
  gametime: string | null;
  marketType: "spread" | "total" | "moneyline";
  side: "home" | "away" | "over" | "under";
  pickLabel: string;
  line: string;
  price: number | null;
  edge: number;
  modelProb: number;
  marketProb: number;
  kellyFraction: number;
};

export type WithheldItem = {
  gameId: string;
  away: string;
  home: string;
  edge: number | null;
  value: number | null;
  threshold: number | null;
};

export type Withheld = {
  kind: "invariant" | "gap" | "threshold";
  checkName: string;
  reason: string;
  failedTeams: number;
  totalTeams: number;
  items: WithheldItem[];
};

type CandidateSide = {
  marketType: "spread" | "total" | "moneyline";
  side: "home" | "away" | "over" | "under";
  edgeSide: EdgeSide | null;
  pickLabel: string;
  lineText: string;
};

function candidateSides(row: BoardRow): CandidateSide[] {
  const spreadHome = row.spread_line != null ? homeLine(row.spread_line) : null;
  const spreadAway = spreadHome != null ? -spreadHome : null;
  const total = row.total_line;
  return [
    {
      marketType: "spread",
      side: "home",
      edgeSide: row.edges.spread_home,
      pickLabel: spreadHome != null ? `${row.home} ${line(spreadHome)}` : `${row.home} spread`,
      lineText: spreadHome != null ? line(spreadHome) : "—",
    },
    {
      marketType: "spread",
      side: "away",
      edgeSide: row.edges.spread_away,
      pickLabel: spreadAway != null ? `${row.away} ${line(spreadAway)}` : `${row.away} spread`,
      lineText: spreadAway != null ? line(spreadAway) : "—",
    },
    {
      marketType: "total",
      side: "over",
      edgeSide: row.edges.total_over,
      pickLabel: total != null ? `Over ${total.toFixed(1)}` : "Over",
      lineText: total != null ? `O ${total.toFixed(1)}` : "—",
    },
    {
      marketType: "total",
      side: "under",
      edgeSide: row.edges.total_under,
      pickLabel: total != null ? `Under ${total.toFixed(1)}` : "Under",
      lineText: total != null ? `U ${total.toFixed(1)}` : "—",
    },
    {
      marketType: "moneyline",
      side: "home",
      edgeSide: row.edges.ml_home,
      pickLabel: `${row.home} ML`,
      lineText: "ML",
    },
    {
      marketType: "moneyline",
      side: "away",
      edgeSide: row.edges.ml_away,
      pickLabel: `${row.away} ML`,
      lineText: "ML",
    },
  ];
}

export function weekBets(
  rows: readonly BoardRow[],
  checks: Record<string, GameChecks>,
): { bets: Bet[]; withheld: Withheld[] } {
  const bets: Bet[] = [];
  const invariantMap = new Map<
    string,
    { teams: Set<string>; items: WithheldItem[] }
  >();
  const spreadGapItems: WithheldItem[] = [];
  const totalGapItems: WithheldItem[] = [];

  const unstarted = rows.filter((r) => !r.has_started);
  const totalTeams = unstarted.length * 2;

  for (const row of unstarted) {
    const gc = checks[row.game_id];
    const rowMaxEdge = Math.max(
      0,
      ...Object.values(row.edges).map((e) => e?.edge ?? 0),
    );

    if (gc?.status === "fail") {
      const invRows = gc.failedRows.filter((f) => f.severity === "invariant");
      const names = invRows.length
        ? [...new Set(invRows.map((f) => f.check_name))]
        : gc.failed;
      for (const name of names) {
        const entry = invariantMap.get(name) ?? { teams: new Set<string>(), items: [] };
        const matchingRows = invRows.filter((f) => f.check_name === name);
        for (const mr of matchingRows) {
          if (mr.team) entry.teams.add(mr.team);
        }
        entry.items.push({
          gameId: row.game_id,
          away: row.away,
          home: row.home,
          edge: rowMaxEdge > 0 ? rowMaxEdge : null,
          value: matchingRows[0]?.value ?? null,
          threshold: matchingRows[0]?.threshold ?? null,
        });
        invariantMap.set(name, entry);
      }
      continue;
    }

    const failedSpreadGap = gc?.failedRows.find((f) => f.check_name === "spread_gap_vs_market");
    const failedTotalGap = gc?.failedRows.find((f) => f.check_name === "total_gap_vs_market");

    const sides = candidateSides(row);
    const maxSpreadMlEdge = Math.max(
      0,
      row.edges.spread_home?.edge ?? 0,
      row.edges.spread_away?.edge ?? 0,
      row.edges.ml_home?.edge ?? 0,
      row.edges.ml_away?.edge ?? 0,
    );
    const maxTotalEdge = Math.max(
      0,
      row.edges.total_over?.edge ?? 0,
      row.edges.total_under?.edge ?? 0,
    );

    if (failedSpreadGap && maxSpreadMlEdge >= STRONG) {
      spreadGapItems.push({
        gameId: row.game_id,
        away: row.away,
        home: row.home,
        edge: maxSpreadMlEdge,
        value: failedSpreadGap.value,
        threshold: failedSpreadGap.threshold,
      });
    }
    if (failedTotalGap && maxTotalEdge >= STRONG) {
      totalGapItems.push({
        gameId: row.game_id,
        away: row.away,
        home: row.home,
        edge: maxTotalEdge,
        value: failedTotalGap.value,
        threshold: failedTotalGap.threshold,
      });
    }

    for (const c of sides) {
      if (!c.edgeSide) continue;
      if (
        failedSpreadGap &&
        (c.marketType === "spread" || c.marketType === "moneyline")
      ) {
        continue;
      }
      if (failedTotalGap && c.marketType === "total") {
        continue;
      }
      if (c.edgeSide.edge < STRONG) continue;
      bets.push({
        gameId: row.game_id,
        away: row.away,
        home: row.home,
        gameday: row.gameday,
        gametime: row.gametime,
        marketType: c.marketType,
        side: c.side,
        pickLabel: c.pickLabel,
        line: c.lineText,
        price: c.edgeSide.price,
        edge: c.edgeSide.edge,
        modelProb: c.edgeSide.model_prob,
        marketProb: c.edgeSide.market_prob,
        kellyFraction: c.edgeSide.kelly_fraction,
      });
    }
  }

  bets.sort((a, b) => b.edge - a.edge || a.gameId.localeCompare(b.gameId));

  const withheld: Withheld[] = [];
  for (const [checkName, info] of invariantMap.entries()) {
    const failedTeams = info.teams.size || info.items.length;
    const teamText =
      info.teams.size > 0
        ? `on ${failedTeams} of ${totalTeams} teams`
        : `on ${info.items.length} game${info.items.length === 1 ? "" : "s"}`;
    withheld.push({
      kind: "invariant",
      checkName,
      reason: `failed ${checkName} ${teamText}`,
      failedTeams,
      totalTeams,
      items: info.items,
    });
  }

  if (spreadGapItems.length > 0) {
    spreadGapItems.sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0));
    withheld.push({
      kind: "gap",
      checkName: "spread_gap_vs_market",
      reason: "model and market differ by more than 4 points; check news",
      failedTeams: spreadGapItems.length,
      totalTeams: unstarted.length,
      items: spreadGapItems,
    });
  }

  if (totalGapItems.length > 0) {
    totalGapItems.sort((a, b) => (b.edge ?? 0) - (a.edge ?? 0));
    withheld.push({
      kind: "gap",
      checkName: "total_gap_vs_market",
      reason: "model and market total differ by more than 6 points; check news",
      failedTeams: totalGapItems.length,
      totalTeams: unstarted.length,
      items: totalGapItems,
    });
  }

  return { bets, withheld };
}
