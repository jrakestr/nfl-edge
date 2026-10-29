import type { SeasonRollup } from "@/lib/contest-history";
import { signedMoney } from "./format";

const W = 560;
const H = 180;
const PAD_L = 24;
const PAD_R = 24;
const PAD_T = 28;
const PAD_B = 28;

export function CumulativeNet({ rows }: { rows: readonly SeasonRollup[] }) {
  if (rows.length === 0) return null;
  const values = rows.map((r) => r.cumulativeNet);
  const maxV = Math.max(0, ...values);
  const minV = Math.min(0, ...values);
  const span = Math.max(maxV - minV, 1);
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const zeroY = PAD_T + (maxV / span) * plotH;

  const pts = rows.map((r, i) => {
    const x = rows.length === 1 ? PAD_L + plotW / 2 : PAD_L + (i / (rows.length - 1)) * plotW;
    const y = PAD_T + ((maxV - r.cumulativeNet) / span) * plotH;
    return { x, y, r };
  });
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1]!;

  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="t-sentence font-semibold">Cumulative net</h2>
        <span className="t-caption tnum font-semibold text-foreground">
          {signedMoney(last.r.cumulativeNet, 0)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-44 w-full"
        role="img"
        aria-label={`Cumulative net through ${last.r.season}: ${signedMoney(last.r.cumulativeNet, 0)}`}
      >
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--border)"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <path d={path} fill="none" stroke="var(--foreground)" strokeWidth={2} />
        {pts.map((p) => (
          <g key={p.r.season}>
            <circle
              cx={p.x}
              cy={p.y}
              r={4}
              fill={p.r.cumulativeNet >= 0 ? "var(--edge-pos)" : "var(--edge-neg)"}
            />
            <text
              x={p.x}
              y={H - 6}
              textAnchor="middle"
              fill="var(--muted-foreground)"
              fontSize={14}
              fontWeight={500}
            >
              {p.r.season}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
