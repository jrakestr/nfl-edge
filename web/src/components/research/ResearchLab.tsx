"use client";

import { useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { PositionPill } from "@/components/ui/PositionPill";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { shortStamp } from "@/lib/format";
import { scoreText } from "@/lib/research/display";
import {
  buildNumericResearchRows,
  type AuditedLineup,
  type AuditedSlot,
  type NumericResearchRow,
  type PoolPlayer,
  type VerdictKind,
} from "@/lib/research/questions";
import type { Metric, ScoredPlayer } from "@/lib/research/score";

const VERDICT_STYLE: Record<VerdictKind, string> = {
  VETO: "border-edge-neg/40 bg-edge-neg/10 text-edge-neg",
  FLAG: "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  KEEP: "border-edge-pos/40 bg-edge-pos/10 text-edge-pos",
  NO_READ: "border-border bg-muted/40 text-muted-foreground",
};

const VERDICT_LABEL: Record<VerdictKind, string> = {
  VETO: "VETO",
  FLAG: "FLAG",
  KEEP: "KEEP",
  NO_READ: "NO READ",
};

export function VerdictChip({ verdict }: { verdict: VerdictKind }) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded border px-1.5 font-semibold tracking-wide t-caption ${VERDICT_STYLE[verdict]}`}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

function SlotChip({ slot }: { slot: AuditedSlot }) {
  const tone =
    slot.verdict === "VETO"
      ? "border-edge-neg/50 bg-edge-neg/10"
      : slot.verdict === "FLAG"
        ? "border-amber-500/50 bg-amber-500/10"
        : "border-border-soft bg-card";
  return (
    <div
      className={`flex items-center gap-1.5 rounded border px-2 py-1 ${tone}`}
      title={slot.reasons.join(" · ")}
    >
      <span className="t-caption font-semibold text-muted-foreground">{slot.slot}</span>
      <span className="t-body font-medium text-foreground">{slot.name}</span>
      <VerdictChip verdict={slot.verdict} />
    </div>
  );
}

function LineupAuditCard({ lineup, index }: { lineup: AuditedLineup; index: number }) {
  const w = lineup.weakestSlot;
  return (
    <article className="card flex flex-col gap-3 p-4" aria-label={`Lineup ${index + 1}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-soft pb-2">
        <div className="flex items-center gap-2">
          <span className="t-body font-semibold text-foreground">Lineup #{index + 1}</span>
          <VerdictChip
            verdict={lineup.status === "VETOED" ? "VETO" : lineup.status === "FLAGGED" ? "FLAG" : "KEEP"}
          />
          {lineup.vetoCount > 0 ? (
            <span className="t-caption text-edge-neg">{lineup.vetoCount} veto</span>
          ) : null}
          {lineup.flagCount > 0 ? (
            <span className="t-caption text-muted-foreground">{lineup.flagCount} flag</span>
          ) : null}
        </div>
        <div className="flex items-center gap-3 t-caption tnum text-muted-foreground">
          <span>${lineup.salaryUsed.toLocaleString()}</span>
          {lineup.projFpts != null ? <span>{lineup.projFpts.toFixed(1)} proj</span> : null}
          {lineup.simWinPct != null ? <span>{(lineup.simWinPct * 100).toFixed(1)}% win</span> : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {lineup.slots.map((s, idx) => (
          <SlotChip key={`${s.slot}-${s.playerId ?? idx}`} slot={s} />
        ))}
      </div>

      {w ? (
        <div className="flex flex-col gap-2 rounded-md border border-border-soft bg-muted/20 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="t-caption font-semibold text-muted-foreground">Weakest slot:</span>
            <PositionPill position={w.position} />
            <span className="t-body font-semibold text-foreground">{w.name}</span>
            <span className="t-caption text-muted-foreground">({w.team})</span>
            <VerdictChip verdict={w.verdict} />
            <span className="t-caption text-foreground">{w.reasons.join(" · ")}</span>
          </div>
          {w.headline ? (
            <p className="t-caption text-muted-foreground">News: &ldquo;{w.headline}&rdquo;</p>
          ) : null}
          {w.swaps.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="t-caption font-semibold text-muted-foreground">Suggested swaps (sim-ranked):</span>
              {w.swaps.map((sw) => (
                <span
                  key={sw.playerId}
                  className="inline-flex items-center gap-1.5 rounded border border-border bg-card px-2 py-1 t-caption tnum"
                >
                  <span className="font-semibold text-foreground">{sw.name}</span>
                  <span className="text-muted-foreground">{sw.team}</span>
                  <span>${sw.salary.toLocaleString()}</span>
                  <span className="text-foreground">{sw.projDkMean.toFixed(1)} pts</span>
                  <span className={sw.projDelta >= 0 ? "text-edge-pos" : "text-edge-neg"}>
                    ({sw.projDelta >= 0 ? "+" : ""}
                    {sw.projDelta.toFixed(1)})
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <p className="t-caption text-muted-foreground">No cap-legal KEEP replacement found in pool.</p>
          )}
        </div>
      ) : (
        <p className="t-caption text-muted-foreground">All slots cleared Jev injury and role checks.</p>
      )}
    </article>
  );
}

export type LineupAuditProps = {
  week: number;
  slate: string;
  auditedAt: string | null;
  modelResolved: string | null;
  auditedPlayerCount: number;
  lineups: AuditedLineup[];
};

export function LineupAuditSection({
  week,
  slate,
  auditedAt,
  modelResolved,
  auditedPlayerCount,
  lineups,
}: LineupAuditProps) {
  const [filter, setFilter] = useState<"ALL" | "RISK" | "CLEAR">("ALL");
  const cliCmd = `uv run nfl-edge research audit --week ${week} --site dk --slate ${slate}`;

  if (lineups.length === 0) {
    return (
      <section className="flex flex-col gap-3" aria-label="Lineup Audit">
        <EmptyState title={`No saved lineups for week ${week} (${slate})`}>
          Build lineups for week {week} and run <code>{cliCmd}</code> to inspect Jev slot verdicts and swap
          suggestions.
        </EmptyState>
      </section>
    );
  }

  const vetoed = lineups.filter((l) => l.status === "VETOED").length;
  const flagged = lineups.filter((l) => l.status === "FLAGGED").length;
  const clear = lineups.filter((l) => l.status === "CLEAR").length;

  const visible = lineups.filter((l) => {
    if (filter === "RISK") return l.status === "VETOED" || l.status === "FLAGGED";
    if (filter === "CLEAR") return l.status === "CLEAR";
    return true;
  });

  return (
    <section className="flex flex-col gap-4" aria-label="Lineup Audit">
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="t-title">Jev Lineup Audit</h2>
            <span className="t-caption text-muted-foreground">
              {lineups.length} lineups ({vetoed} vetoed, {flagged} flagged, {clear} clear)
            </span>
          </div>
          {auditedAt ? (
            <p className="t-caption text-muted-foreground">
              Last audit {shortStamp(auditedAt)} · model <code>{modelResolved ?? "jev-latest"}</code> ·{" "}
              {auditedPlayerCount} players judged. Display-only; sim and optimizer untouched.
            </p>
          ) : (
            <p className="t-caption text-muted-foreground">
              No Jev judgments recorded for this slate yet. Run <code>{cliCmd}</code> after{" "}
              <code>uv run nfl-edge ingest fantasypros-news</code>.
            </p>
          )}
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="Filter lineups">
          {(["ALL", "RISK", "CLEAR"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilter(mode)}
              className={`h-7 rounded border px-2.5 t-caption font-medium ${
                filter === mode
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-card text-foreground"
              }`}
            >
              {mode === "ALL" ? `All (${lineups.length})` : mode === "RISK" ? `Flag/Veto (${vetoed + flagged})` : `Clear (${clear})`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {visible.map((lu, i) => (
          <LineupAuditCard key={lu.lineupId} lineup={lu} index={i} />
        ))}
      </div>
    </section>
  );
}

type TableRow = NumericResearchRow & { scores: ScoredPlayer["scores"] };

export function ResearchLab({
  rows,
  metrics = [],
  metricErrors = {},
  poolByPid = {},
  audit,
}: {
  rows: ScoredPlayer[];
  metrics?: Metric[];
  metricErrors?: Record<string, string[]>;
  poolByPid?: Record<string, PoolPlayer>;
  audit?: LineupAuditProps;
}) {
  const scored = metrics.filter((m) => !metricErrors[m.id]);
  const numericRows = buildNumericResearchRows(rows, poolByPid);
  const tableRows: TableRow[] = numericRows.map((nr, i) => ({
    ...nr,
    scores: rows[i]?.scores ?? {},
  }));

  const columns: DataColumn<TableRow>[] = [
    {
      id: "player",
      header: "Player",
      sortValue: (r) => r.name,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <PositionPill position={r.position} />
          <span className="t-body font-semibold text-foreground">{r.name}</span>
        </span>
      ),
    },
    { id: "team", header: "Team", sortValue: (r) => r.team, cell: (r) => <span className="t-body">{r.team}</span> },
    {
      id: "verdict",
      header: "Jev Verdict",
      sortValue: (r) => r.verdict,
      cell: (r) => <VerdictChip verdict={r.verdict} />,
    },
    {
      id: "reason",
      header: "Audit Note",
      sortable: false,
      className: "max-w-xs whitespace-normal",
      cell: (r) => (
        <span className="t-caption leading-snug text-muted-foreground" title={r.headline ?? undefined}>
          {r.reason}
        </span>
      ),
    },
    {
      id: "salary",
      header: "Salary",
      align: "right",
      sortValue: (r) => r.salary,
      cell: (r) => (
        <span className="t-body tnum">{r.salary != null ? `$${r.salary.toLocaleString()}` : "—"}</span>
      ),
    },
    {
      id: "simMean",
      header: "Sim Mean",
      align: "right",
      sortValue: (r) => r.simMean,
      cell: (r) => <span className="t-body tnum">{r.simMean != null ? r.simMean.toFixed(1) : "—"}</span>,
    },
    {
      id: "simP90",
      header: "Ceiling (P90)",
      align: "right",
      sortValue: (r) => r.simP90,
      cell: (r) => <span className="t-body tnum">{r.simP90 != null ? r.simP90.toFixed(1) : "—"}</span>,
    },
    {
      id: "valueX",
      header: "Value (pts/$1k)",
      align: "right",
      sortValue: (r) => r.valueX,
      cell: (r) => <span className="t-body tnum">{r.valueX != null ? r.valueX.toFixed(2) : "—"}</span>,
    },
    ...scored.map<DataColumn<TableRow>>((m) => ({
      id: `m${m.id}`,
      header: m.name,
      align: "right",
      sortValue: (r) => r.scores[m.id]?.value ?? null,
      cell: (r) => {
        const s = r.scores[m.id];
        if (!s || s.value == null) {
          return (
            <span className="t-body tnum" title={s?.missing.length ? `Missing: ${s.missing.join(", ")}` : undefined}>
              —
            </span>
          );
        }
        return (
          <span className="t-body tnum">
            {scoreText(s.value)}{" "}
            <span className="t-caption text-muted-foreground">
              #{s.positionRank} {r.position}
            </span>
          </span>
        );
      },
    })),
  ];

  return (
    <div className="flex flex-col gap-6">
      {audit ? <LineupAuditSection {...audit} /> : null}
      <section className="flex flex-col gap-3" aria-label="Player Pool">
        <h2 className="t-title">Player Pool &amp; Sim Context</h2>
        <DataTable
          data={tableRows}
          columns={columns}
          getRowId={(r) => r.playerId}
          empty="No players."
          ariaLabel="Scored players"
          defaultSort={{ id: "simMean", dir: "desc" }}
          searchPlaceholder="Search players"
          filters={{
            search: (r, q) => r.name.toLowerCase().includes(q),
            position: (r) => r.position,
            team: (r) => r.team,
          }}
        />
      </section>
    </div>
  );
}
