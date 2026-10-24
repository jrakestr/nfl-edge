import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { LineupAuditSection, ResearchLab } from "@/components/research/ResearchLab";
import { CURRENT_SEASON } from "@/lib/config";
import { shortStamp } from "@/lib/format";
import { slatesForWeek } from "@/lib/queries/dfs";
import { displayWeek } from "@/lib/queries/runs";
import { researchBuild, researchMetrics, researchWeeks, slateLineupAudit } from "@/lib/queries/research";
import { scorePlayers } from "@/lib/research/score";

export const dynamic = "force-dynamic";
export const metadata = { title: "Research Lab" };

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({ searchParams }: PageProps<"/research">) {
  const sp = await searchParams;
  const weekParam = Number(one(sp.week));
  const slateParam = one(sp.slate);
  const [builtWeeks, defaultWeek] = await Promise.all([researchWeeks(CURRENT_SEASON), displayWeek(CURRENT_SEASON)]);
  const week = Number.isInteger(weekParam) && weekParam >= 1 ? weekParam : defaultWeek;
  const slates = await slatesForWeek(CURRENT_SEASON, week, "dk");
  const slate = slateParam && slates.includes(slateParam) ? slateParam : (slates[0] ?? "main");

  const [build, auditSnapshot, metrics] = await Promise.all([
    researchBuild(CURRENT_SEASON, week),
    slateLineupAudit(CURRENT_SEASON, week, "dk", slate),
    researchMetrics(),
  ]);

  const auditProps = {
    week,
    slate: auditSnapshot.slate,
    auditedAt: auditSnapshot.auditedAt,
    modelResolved: auditSnapshot.modelResolved,
    auditedPlayerCount: auditSnapshot.auditedPlayerCount,
    lineups: auditSnapshot.lineups,
  };

  if (!build) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="t-title">Research Lab</h1>
        <LineupAuditSection {...auditProps} />
        <EmptyState title={`No research data for week ${week}`}>
          Player fields for week {week} are built from games before it and have not been built yet. Run{" "}
          <code>uv run nfl-edge research build --week {week}</code>.
          {builtWeeks.length ? " Built weeks: " : ""}
          {builtWeeks.map((w, i) => (
            <span key={w}>
              {i ? ", " : ""}
              <Link className="underline" href={`/research?week=${w}`}>
                week {w}
              </Link>
            </span>
          ))}
        </EmptyState>
      </div>
    );
  }

  const { rows, metricErrors } = scorePlayers(build.players, metrics, build.fields);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="t-title">Research Lab</h1>
          {slates.length > 1 ? (
            <div className="flex items-center gap-1.5 t-caption">
              <span className="text-muted-foreground">Slate:</span>
              {slates.map((s) => (
                <Link
                  key={s}
                  href={`/research?week=${week}&slate=${s}`}
                  className={`rounded border px-2 py-0.5 ${
                    s === slate ? "border-foreground bg-foreground text-background" : "border-border bg-card"
                  }`}
                >
                  {s}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <p className="t-sentence text-muted-foreground">
          Week {week} context uses games through week {week - 1}. {build.players.length} players
          {build.builtAt ? `, built ${shortStamp(build.builtAt)}` : ""}.
          {builtWeeks.length > 1 ? " Other weeks: " : ""}
          {builtWeeks
            .filter((w) => w !== week)
            .map((w, i) => (
              <span key={w}>
                {i ? ", " : ""}
                <Link className="underline" href={`/research?week=${w}`}>
                  week {w}
                </Link>
              </span>
            ))}
        </p>
      </div>
      <ResearchLab
        rows={rows}
        metrics={metrics}
        metricErrors={metricErrors}
        poolByPid={auditSnapshot.poolByPid}
        audit={auditProps}
      />
    </div>
  );
}
