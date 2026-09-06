"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { SearchBox } from "./SearchBox";
import { usePageActions } from "./PageActions";

const LABELS: Record<string, string> = {
  week: "Edge board",
  games: "Games",
  players: "Players",
  props: "Props",
  lineups: "Lineups",
  grading: "Grading",
};

function crumbs(pathname: string): { href: string; label: string }[] {
  const parts = pathname.split("/").filter(Boolean);
  const out: { href: string; label: string }[] = [];
  parts.forEach((p, i) => {
    const href = "/" + parts.slice(0, i + 1).join("/");
    let label = LABELS[p] ?? decodeURIComponent(p);
    if (parts[i - 1] === "week" && /^\d+$/.test(p)) label = `Week ${p}`;
    out.push({ href, label });
  });
  return out;
}

export function TopBar() {
  const pathname = usePathname() ?? "/";
  const items = crumbs(pathname);
  const actions = usePageActions();
  return (
    <header className="sticky top-0 z-10 flex h-[var(--topbar-height)] items-center gap-4 border-b border-border bg-card px-5">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 t-body">
        {items.length === 0 ? (
          <span className="text-foreground">Home</span>
        ) : (
          items.map((c, i) => {
            const last = i === items.length - 1;
            return (
              <Fragment key={c.href}>
                {i > 0 && <span className="text-dim">/</span>}
                {last ? (
                  <span className="truncate text-foreground font-semibold" aria-current="page">
                    {c.label}
                  </span>
                ) : (
                  <Link href={c.href} className="truncate text-muted-foreground hover:text-foreground">
                    {c.label}
                  </Link>
                )}
              </Fragment>
            );
          })
        )}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        {actions}
        <SearchBox />
      </div>
    </header>
  );
}
