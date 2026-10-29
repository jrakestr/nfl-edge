import type { BucketRollup, FeeBucket } from "@/lib/contest-history";
import { signedPct } from "@/lib/edge";

const W = 560;
const H = 180;
const PAD_L = 16;
const PAD_R = 16;
const PAD_T = 28;
const PAD_B = 28;

export function RoiByBucket({ rows }: { rows: readonly BucketRollup<FeeBucket>[] }) {
  const paid = rows.filter((r) => r.bucket !== "free" && r.entries > 0 && r.roi != null);
  if (paid.length === 0) return null;
  const values = paid.map((r) => r.roi ?? 0);
  const maxPos = Math.max(0, ...values);
  const minNeg = Math.min(0, ...values);
  const span = Math.max(maxPos - minNeg, 0.01);
  const plotW = W - PAD_L - PAD_R;
  const plotH = H - PAD_T - PAD_B;
  const zeroY = PAD_T + (maxPos / span) * plotH;
  const step = plotW / paid.length;
  const barW = Math.min(56, Math.max(20, step * 0.56));

  return (
    <div className="card flex flex-col gap-2 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="t-sentence font-semibold">ROI by entry fee</h2>
        <span className="t-caption text-muted-foreground">Paid entries only</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-44 w-full"
        role="img"
        aria-label="ROI by entry fee bucket"
      >
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={zeroY}
          y2={zeroY}
          stroke="var(--border)"
          strokeWidth={1}
        />
        {paid.map((r, i) => {
          const roi = r.roi ?? 0;
          const cx = PAD_L + step * (i + 0.5);
          const x = cx - barW / 2;
          const h = (Math.abs(roi) / span) * plotH;
          const y = roi >= 0 ? zeroY - h : zeroY;
          const fill = roi > 0 ? "var(--edge-pos)" : roi < 0 ? "var(--edge-neg)" : "var(--muted-foreground)";
          const labelY = roi >= 0 ? Math.max(14, y - 6) : Math.min(H - 18, y + h + 14);
          return (
            <g key={r.bucket} data-fee-bucket={r.bucket}>
              <rect x={x} y={y} width={barW} height={Math.max(2, h)} rx={3} fill={fill} />
              <text
                x={cx}
                y={labelY}
                textAnchor="middle"
                fill="var(--foreground)"
                fontSize={14}
                fontWeight={600}
              >
                {signedPct(roi, 1)}
              </text>
              <text
                x={cx}
                y={H - 6}
                textAnchor="middle"
                fill="var(--muted-foreground)"
                fontSize={14}
                fontWeight={500}
              >
                {r.bucket}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
