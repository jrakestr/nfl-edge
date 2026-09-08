import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/week/[n]/optimize/[site]/[slate]">): Promise<Metadata> {
  const { n, site, slate } = await params;
  return { title: `Week ${n} · Optimize · ${site} · ${slate}` };
}

/** Placeholder so NAV and breadcrumbs resolve before the browser ILP. */
export default async function Page({ params }: PageProps<"/week/[n]/optimize/[site]/[slate]">) {
  const { n, site, slate } = await params;
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="t-title">Optimize</h1>
        <p className="t-body text-muted-foreground">
          Week {n} · {site.toUpperCase()} · {slate}. Lineups generate here once the browser optimizer is
          wired.
        </p>
      </header>
    </div>
  );
}
