import { direction, intensity, signed } from "@/lib/edge";
import { shortStamp } from "@/lib/format";
import { impliedFromLines, linesDiffer, simScore } from "@/lib/implied";
import { atRunLabel } from "@/lib/check-display";
import { starterDiffers, type TeamInput } from "@/lib/team-input";
import type { BoardRow } from "@/lib/types";
import { EdgeDiff } from "./EdgeCell";

/** Mean team points vs labeled markets, plus persisted team/QB inputs when the run has them. */
export function GameWhy({
  row,
  runCreatedAt,
  inputs = {},
}: {
  row: BoardRow;
  runCreatedAt?: string | null;
  inputs?: Record<string, TeamInput>;
}) {
  const model = simScore(row);
  const now = impliedFromLines(row.total_line, row.spread_line);
  const atRun = impliedFromLines(row.run_market_total, row.run_market_spread);
  const moved = linesDiffer(row.run_market_total, row.run_market_spread, row.total_line, row.spread_line);
  const asOf = row.captured_at ? `as of ${shortStamp(row.captured_at)}` : "as of latest line";
  const runStamp = runCreatedAt ? atRunLabel(runCreatedAt) : "at run";

  return (
    <section aria-label="Why" className="flex flex-col gap-3">
      <h4 className="t-colhead text-muted-foreground">Why</h4>
      {(["away", "home"] as const).map((side) => {
        const ours = model?.[side] ?? null;
        const live = now?.[side] ?? null;
        const run = atRun?.[side] ?? null;
        const diff = ours != null && live != null ? ours - live : null;
        const dir = direction(diff);
        const input = inputs[row[side]];
        return (
          <div key={side} className="flex flex-col gap-1" data-side={side}>
            <p className="t-body font-semibold text-foreground">{row[side]}</p>
            <WhyRow label="Mean points" value={ours} tone="model" digits={1} />
            <WhyRow label={`Market ${asOf}`} value={live} tone="market" digits={1} />
            {moved ? <WhyRow label={`Market ${runStamp}`} value={run} tone="market" digits={1} /> : null}
            <div className="flex items-baseline justify-between gap-3">
              <span className="t-caption text-muted-foreground">Difference vs current</span>
              {diff == null ? (
                <span className="t-caption">—</span>
              ) : (
                <EdgeDiff dir={dir} inten={intensity(diff)}>
                  {signed(diff)}
                </EdgeDiff>
              )}
            </div>
            <WhyPriors input={input} />
          </div>
        );
      })}
    </section>
  );
}

function WhyPriors({ input }: { input: TeamInput | undefined }) {
  if (!input) {
    return <p className="t-caption text-muted-foreground">not on this run</p>;
  }
  const starter = input.qb_starter_name ?? input.qb_starter_id ?? "—";
  const lookback = input.qb_lookback_name ?? input.qb_lookback_id ?? "—";
  return (
    <>
      <WhyRow label="Projected starter" value={starter} />
      <WhyRow
        label="Most attempts in lookback"
        value={`${lookback}${input.qb_lookback_att == null ? "" : ` · ${input.qb_lookback_att.toFixed(0)} att`}`}
      />
      <WhyRow
        label="Starter attempts in lookback"
        value={input.qb_starter_att == null ? "—" : input.qb_starter_att.toFixed(0)}
      />
      <WhyRow
        label="qb_pass_factor"
        value={input.qb_pass_factor == null ? "—" : input.qb_pass_factor.toFixed(3)}
      />
      {starterDiffers(input) ? (
        <p className="t-caption text-warn">starter differs from most attempts in lookback</p>
      ) : null}
      <WhyRow label="off_ppd_adj" value={ppdLine(input.off_ppd_adj, input.league_off_ppd)} />
      <WhyRow label="def_ppd_allowed" value={ppdLine(input.def_ppd_allowed, input.league_def_ppd_allowed)} />
      <WhyRow label="drives_mean" value={input.drives_mean} digits={1} />
    </>
  );
}

function ppdLine(value: number | null, league: number | null): string {
  if (value == null) return "—";
  return league == null ? value.toFixed(2) : `${value.toFixed(2)} · league ${league.toFixed(2)}`;
}

function WhyRow({
  label,
  value,
  tone = "model",
  digits = 1,
}: {
  label: string;
  value: number | string | null;
  tone?: "model" | "market";
  digits?: number;
}) {
  const shown = value == null ? "—" : typeof value === "number" ? value.toFixed(digits) : value;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="t-caption text-muted-foreground">{label}</span>
      <span className={`tnum font-semibold ${tone === "market" ? "text-line" : "text-foreground"}`}>{shown}</span>
    </div>
  );
}
