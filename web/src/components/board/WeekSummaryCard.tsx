import { emphasize } from "./emphasize";

/** The week summary sentence (payload.week_summary; every verdict row carries the same string). */
export function WeekSummaryCard({
  summary,
  caption,
  children,
}: {
  summary: string | null;
  caption: string;
  children?: React.ReactNode; // the Plain English / Table toggle
}) {
  return (
    <section className="card flex items-start gap-4 p-4" aria-label="Week summary">
      <div className="min-w-0 flex-1">
        <p className="t-sentence text-[15px] leading-6">
          {summary ? emphasize(summary) : "No verdicts for this run yet."}
        </p>
        <p className="mt-1 t-caption">{caption}</p>
      </div>
      {children}
    </section>
  );
}
