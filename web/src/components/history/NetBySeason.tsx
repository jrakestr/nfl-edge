import type { SeasonRollup } from "@/lib/contest-history";
import { signedMoney } from "./format";

const W = 560;
const H = 180;
const PAD_L = 16;
const PAD_R = 16;
const PAD_T = 28;
const PAD_B = 28;

export function NetBySeason({ rows }: { rows: readonly SeasonRollup[] }) {
  if (rows.length === 0) return null;
  const values = rows.map((r) => r.net);
  const maxPos = Math.max(0, ...values);
  const minNeg = Math.min(0, ...values);
  const span = Math.max(maxPos - minNeg, 1);
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const zeroY = PAD_T + (maxPos / span) * plotH;
  const step = plotW / rows.length;
  const barW = Math.min(48, Math.max(16, step * 0.56));

  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="t-sentence font-semibold">Net by season</h2>
        <span className="t-caption text-muted-foreground">Winnings minus entry fees (Aug–Feb season)</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-44 w-full"
        role="img"
        aria-label={`Net by season from ${rows[0]?.season} to ${rows[rows.length - 1]?.season}`}
      >
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--border)"
          strokeWidth={1}
        />
        {rows.map((r, i) => {
          const cx = PAD_L + step * (i + 0.5);
          const x = cx - barW / 2;
          const h = (Math.abs(r.net) / span) * plotH;
          const y = r.net >= 0 ? zeroY - h : zeroY;
          const fill = r.net > 0 ? "var(--edge-pos)" : r.net < 0 ? "var(--edge-neg)" : "var(--muted-foreground)";
          const labelY = r.net >= 0 ? Math.max(14, y - 6) : Math.min(H - 18, y + h + 14);
          return (
            <g key={r.season} data-season={r.season}>
              <rect x={x} y={y} width={barW} height={Math.max(2, h)} rx={3} fill={fill} />
              <text
                x={cx}
                y={labelY}
                textAnchor="middle"
                fill="var(--foreground)"
                fontSize={14}
                fontWeight={600}
              >
                {signedMoney(r.net, 0)}
              </text>
              <text
                x={cx}
                y={H - 6}
                textAnchor="middle"
                fill="var(--muted-foreground)"
                fontSize={14}
                fontWeight={500}
              >
                {r.season}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
