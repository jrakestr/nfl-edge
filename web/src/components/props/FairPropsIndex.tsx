"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EdgeDiff } from "@/components/board/EdgeCell";
import { DataTable } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/input";
import { PositionPill } from "@/components/ui/PositionPill";
import { saveMarketLine } from "@/lib/actions/save-market-line";
import { direction, intensity, pct, price, signedPct } from "@/lib/edge";
import { pOverFromHist, STAT_LABELS, STAT_ORDER, probToAmerican } from "@/lib/prop-stats";
import type { FairProp } from "@/lib/types";

const STAT_RANK = Object.fromEntries(STAT_ORDER.map((s, i) => [s, i]));

function ourLine(row: FairProp): string {
  if (row.stat === "anytime_td") return price(probToAmerican(row.p_over));
  return row.fair_line.toFixed(1);
}

function gameLabel(r: FairProp): string {
  return r.away && r.home ? `${r.away} @ ${r.home}` : r.game_id ?? "—";
}

function RangeBar({ row }: { row: FairProp }) {
  const p10 = row.p10;
  const p90 = row.p90;
  if (p10 == null || p90 == null || p90 <= p10) return <span className="t-caption">—</span>;
  const mark = row.stat === "anytime_td" ? row.mean : row.fair_line;
  const t = mark == null ? 0.5 : Math.min(1, Math.max(0, (mark - p10) / (p90 - p10)));
  return (
    <div
      className="relative h-2 w-16 rounded-sm bg-muted"
      title={`${p10.toFixed(0)}–${p90.toFixed(0)}`}
    >
      <div className="absolute inset-y-0 w-full rounded-sm bg-foreground/25" />
      <div className="absolute top-0 h-full w-px bg-foreground" style={{ left: `${t * 100}%` }} />
    </div>
  );
}

function EnterLine({
  row,
  season,
  week,
}: {
  row: FairProp;
  season: number;
  week: number;
}) {
  const [raw, setRaw] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const line = raw === "" ? null : Number(raw);
  const live =
    line != null && Number.isFinite(line) ? pOverFromHist(row.hist, line) : null;
  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (line == null || !Number.isFinite(line)) return;
        start(async () => {
          const r = await saveMarketLine({
            season,
            week,
            playerId: row.player_id,
            playerName: row.player_name,
            stat: row.stat,
            line,
            gameId: row.game_id,
          });
          if (r.ok) router.refresh();
        });
      }}
    >
      <Input
        className="h-7 w-16 tnum"
        inputMode="decimal"
        aria-label={`Enter a line for ${row.player_name} ${STAT_LABELS[row.stat] ?? row.stat}`}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="—"
      />
      <span className="t-caption tnum w-10">{live != null ? pct(live) : ""}</span>
      <button
        type="submit"
        disabled={pending || line == null || !Number.isFinite(line)}
        className="t-caption text-foreground underline-offset-2 hover:underline disabled:text-muted-foreground"
      >
        Save
      </button>
    </form>
  );
}

/** Full sim-derived props board. PropsIndex.tsx is the older market-edge list. */
export function FairPropsIndex({
  rows = [],
  season = 2026,
  week = 1,
}: {
  rows?: FairProp[];
  season?: number;
  week?: number;
}) {
  const [stat, setStat] = useState("all");
  const data = useMemo(() => {
    const base = stat === "all" ? rows : rows.filter((r) => r.stat === stat);
    return [...base].sort(
      (a, b) =>
        (b.fpts_dk_mean ?? 0) - (a.fpts_dk_mean ?? 0) ||
        a.player_name.localeCompare(b.player_name) ||
        (STAT_RANK[a.stat] ?? 99) - (STAT_RANK[b.stat] ?? 99),
    );
  }, [rows, stat]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <h1 className="t-title">Props</h1>
        <p className="t-caption">
          Our line is the sim median on a hook. Two-sided books show a de-vigged edge.
          A one-sided price shows a floor (model minus the vigged implied), not an edge.
        </p>
        <label className="flex w-fit flex-col gap-1">
          <span className="t-colhead text-muted-foreground">Stat</span>
          <select
            className="h-8 rounded-md border border-border bg-card px-2 t-body"
            aria-label="Stat"
            value={stat}
            onChange={(e) => setStat(e.target.value)}
          >
            <option value="all">All</option>
            {STAT_ORDER.map((s) => (
              <option key={s} value={s}>
                {STAT_LABELS[s] ?? s}
              </option>
            ))}
          </select>
        </label>
      </header>
      <DataTable
        data={data}
        getRowId={(r) => `${r.player_id}-${r.stat}`}
        empty="No fair lines yet"
        ariaLabel="Fair props"
        searchPlaceholder="Name, team, or stat"
        filters={{
          search: (r, q) =>
            r.player_name.toLowerCase().includes(q) ||
            (r.team ?? "").toLowerCase().includes(q) ||
            (r.opponent ?? "").toLowerCase().includes(q) ||
            (STAT_LABELS[r.stat] ?? r.stat).toLowerCase().includes(q),
          position: (r) => r.position,
          team: (r) => r.team,
          game: (r) => gameLabel(r),
        }}
        columns={[
          {
            id: "player",
            header: "Player",
            sortValue: (r) => r.player_name,
            cell: (r) => (
              <span className="inline-flex items-center gap-1.5">
                <PositionPill position={r.position} />
                <Link
                  href={`/props/${r.game_id ?? "unknown"}/${r.player_id}`}
                  className="font-semibold text-foreground underline-offset-2 hover:underline"
                >
                  {r.player_name}
                </Link>
              </span>
            ),
          },
          {
            id: "team",
            header: "Team",
            sortValue: (r) => r.team ?? "",
            cell: (r) => <span className="t-body font-semibold text-foreground">{r.team ?? "—"}</span>,
          },
          {
            id: "opponent",
            header: "Opp",
            sortValue: (r) => r.opponent ?? "",
            cell: (r) => <span className="t-body font-semibold text-foreground">{r.opponent ?? "—"}</span>,
          },
          {
            id: "stat",
            header: "Stat",
            sortValue: (r) => STAT_RANK[r.stat] ?? 99,
            cell: (r) => <span className="t-caption">{STAT_LABELS[r.stat] ?? r.stat}</span>,
          },
          {
            id: "fair_line",
            header: "Our line",
            align: "right",
            sortValue: (r) => (r.stat === "anytime_td" ? r.p_over : r.fair_line),
            cell: (r) => <span className="tnum font-semibold text-foreground">{ourLine(r)}</span>,
          },
          {
            id: "p_over",
            header: "P(over)",
            align: "right",
            sortValue: (r) => r.p_over,
            cell: (r) => <span className="tnum font-semibold text-foreground">{pct(r.p_over)}</span>,
          },
          {
            id: "range",
            header: "p10–p90",
            sortable: false,
            cell: (r) => <RangeBar row={r} />,
          },
          {
            id: "market_line",
            header: "Market",
            align: "right",
            sortValue: (r) => r.market_line,
            cell: (r) => (
              <span className="tnum font-semibold text-line">{r.market_line != null ? r.market_line : "—"}</span>
            ),
          },
          {
            id: "market_p_over",
            header: "P(over) mkt",
            align: "right",
            sortValue: (r) => r.market_p_over,
            cell: (r) => (
              <span className="tnum font-semibold text-foreground">
                {r.market_p_over != null ? pct(r.market_p_over) : "—"}
              </span>
            ),
          },
          {
            id: "edge",
            header: "Edge",
            metric: "edge",
            align: "right",
            sortValue: (r) => (r.one_sided ? r.edge_floor : r.edge),
            cell: (r) =>
              r.one_sided ? (
                <span className="flex flex-col items-end">
                  <span className="tnum font-semibold text-foreground">{signedPct(r.edge_floor)}</span>
                  <span className="t-caption text-muted-foreground">one-sided price, conservative</span>
                </span>
              ) : r.edge != null ? (
                <EdgeDiff dir={direction(r.edge)} inten={intensity(r.edge)}>
                  {signedPct(r.edge)}
                </EdgeDiff>
              ) : (
                "—"
              ),
          },
          {
            id: "enter",
            header: "Enter a line",
            sortable: false,
            cell: (r) => <EnterLine row={r} season={season} week={week} />,
          },
        ]}
      />
    </div>
  );
}
