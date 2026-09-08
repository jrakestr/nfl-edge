"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { crumbs } from "@/lib/breadcrumbs";
import { SearchBox } from "./SearchBox";
import { usePageActions } from "./PageActions";

export function TopBar() {
  const pathname = usePathname() ?? "/";
  const items = crumbs(pathname);
  const actions = usePageActions();
  return (
    <header className="glass sticky top-0 z-10 flex h-[var(--topbar-height)] items-center gap-4 border-b px-5">
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 t-body">
        {items.length === 0 ? (
          <span className="text-foreground">Home</span>
        ) : (
          items.map((c, i) => {
            const last = i === items.length - 1;
            return (
              <Fragment key={`${c.href}:${c.label}`}>
                {i > 0 && <span className="text-dim">›</span>}
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
