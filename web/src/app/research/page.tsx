import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { ResearchLab } from "@/components/research/ResearchLab";
import { CURRENT_SEASON } from "@/lib/config";
import { shortStamp } from "@/lib/format";
import { displayWeek } from "@/lib/queries/runs";
import { jevCached, researchBuild, researchMetrics, researchWeeks } from "@/lib/queries/research";
import { JEV_MODEL, jevStatus, metricHash } from "@/lib/research/jev";
import { scorePlayers } from "@/lib/research/score";

export const dynamic = "force-dynamic";
export const metadata = { title: "Research Lab" };

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({ searchParams }: PageProps<"/research">) {
  const sp = await searchParams;
  const weekParam = Number(one(sp.week));
  const [builtWeeks, defaultWeek] = await Promise.all([researchWeeks(CURRENT_SEASON), displayWeek(CURRENT_SEASON)]);
  const week = Number.isInteger(weekParam) && weekParam >= 1 ? weekParam : defaultWeek;
  const build = await researchBuild(CURRENT_SEASON, week);

  if (!build) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="t-title">Research Lab</h1>
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

  const metrics = await researchMetrics();
  const { rows, metricErrors } = scorePlayers(build.players, metrics, build.fields);
  const hashes = new Map(metrics.filter((m) => !metricErrors[m.id]).map((m) => [m.id, metricHash(m)]));
  const cache = await jevCached(CURRENT_SEASON, week, JEV_MODEL, [...hashes.values()]);
  const jevScores = Object.fromEntries([...hashes].map(([id, h]) => [id, cache[h] ?? {}]));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="t-title">Research Lab</h1>
        <p className="t-sentence text-muted-foreground">
          Week {week} scores use games through week {week - 1}. {build.players.length} players
          {build.builtAt ? `, built ${shortStamp(build.builtAt)}` : ""}.
          {builtWeeks.length > 1
            ? " Other weeks: "
            : ""}
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
        fields={build.fields}
        jev={jevStatus()}
        week={week}
        jevScores={jevScores}
      />
    </div>
  );
}
