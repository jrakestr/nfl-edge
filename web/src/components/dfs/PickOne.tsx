"use client";

import { useMemo, useState } from "react";
import { LineupCard } from "./LineupCard";
import { Button } from "@/components/ui/button";
import { formatUploadCsv, uploadFilename } from "@/lib/dfs-upload";
import {
  lineupFloor,
  lineupRtsTotal,
  pickOne,
  rtsFlags,
  summedFieldOwn,
  type PickCtx,
  type PickMode,
} from "@/lib/dfs/pick-one";
import { pct as fmtPct } from "@/lib/edge";
import { MetricLabel } from "@/lib/icons";
import type { DfsLineup } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PickOne({
  lineups,
  ctx,
  runId,
  slateId,
  teams,
  positions,
  staleDkIds,
  slate,
}: {
  lineups: DfsLineup[];
  ctx: PickCtx;
  runId: string;
  slateId: string;
  teams: Record<string, string>;
  positions: Record<string, string>;
  staleDkIds?: Set<string>;
  slate: string;
}) {
  const [mode, setMode] = useState<PickMode>("cash");
  const picked = useMemo(() => pickOne(lineups, mode, ctx), [lineups, mode, ctx]);
  const lu = picked.lineup;

  function exportOne() {
    if (!lu) return;
    const csv = formatUploadCsv([lu]);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = uploadFilename(slateId, runId, "single");
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const floor = lu ? lineupFloor(lu, ctx) : null;
  const rts = lu ? lineupRtsTotal(lu, ctx) : null;
  const flags = lu ? rtsFlags(lu, ctx) : [];
  const fieldOwn = lu && mode === "tournament" ? summedFieldOwn(lu, ctx) : null;

  return (
    <section className="card flex flex-col gap-3 p-4" aria-label="Pick one">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="t-title">Pick one</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Contest">
          {(["cash", "tournament"] as const).map((k) => (
            <Button
              key={k}
              type="button"
              size="sm"
              variant={mode === k ? "secondary" : "outline"}
              onClick={() => setMode(k)}
            >
              {k === "cash" ? "Cash" : "Tournament"}
            </Button>
          ))}
        </div>
      </div>
      {mode === "cash" ? (
        <p className="t-sentence">
          Ranked by floor. Win % and ROI were simulated against a tournament field and do not apply.
        </p>
      ) : (
        <p className="t-sentence">
          Ranked by simulated ROI among lineups within 4 points of the top projection that stack the
          quarterback with a teammate at receiver or tight end.
        </p>
      )}
      {lu ? (
        <>
          <LineupCard
            slate={slate}
            lineup={lu}
            teams={teams}
            positions={positions}
            staleDkIds={staleDkIds}
            hideSimStats={picked.hideSimStats}
          />
          <div className="flex flex-wrap items-center gap-3 t-caption">
            {fieldOwn != null ? (
              <MetricLabel metric="ownership">
                Field ownership{" "}
                <span className="tnum font-semibold text-foreground">
                  {fmtPct(fieldOwn, 1)}
                </span>
              </MetricLabel>
            ) : null}
            <MetricLabel metric="projection">
              Floor{" "}
              <span className="tnum font-semibold text-foreground">
                {floor != null ? floor.toFixed(1) : "—"}
              </span>
            </MetricLabel>
            <MetricLabel metric="projection">
              Our projection{" "}
              <span className="tnum font-semibold text-foreground">
                {lu.proj_fpts != null ? lu.proj_fpts.toFixed(1) : "—"}
              </span>
            </MetricLabel>
            <span className="t-caption">
              RTS{" "}
              <span className={cn("tnum font-semibold", picked.hasRts ? "text-foreground" : "")}>
                {picked.hasRts && rts != null ? rts.toFixed(1) : "—"}
              </span>
            </span>
          </div>
          {flags.map((f) => (
            <p key={f} className="t-caption text-warn">
              {f}
            </p>
          ))}
          <Button type="button" size="sm" onClick={exportOne}>
            Export this lineup
          </Button>
        </>
      ) : (
        <p className="t-body">No lineup survived the screens.</p>
      )}
      {picked.removed.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="t-caption text-foreground">
            {picked.removed.length} lineup{picked.removed.length === 1 ? "" : "s"} removed
          </p>
          {picked.removed.slice(0, 8).map((r) => (
            <p key={r.lineup.lineup_id} className="t-caption">
              {r.reasons[0]}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
