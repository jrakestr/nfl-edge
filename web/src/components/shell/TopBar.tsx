"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { crumbs } from "@/lib/breadcrumbs";
import { MobileNav } from "./MobileNav";
import { SearchBox } from "./SearchBox";
import { ThemeToggle } from "./ThemeToggle";
import { usePageActions } from "./PageActions";

export function TopBar() {
  const pathname = usePathname() ?? "/";
  const items = crumbs(pathname);
  const actions = usePageActions();
  return (
    <header className="glass sticky top-0 z-10 flex h-[var(--topbar-height)] items-center gap-2 border-b px-3 md:gap-4 md:px-5">
      <MobileNav />
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1.5 t-body">
        {items.length === 0 ? (
          <span className="text-foreground">Home</span>
        ) : (
          items.map((c, i) => {
            const last = i === items.length - 1;
            return (
              <Fragment key={`${c.href}:${c.label}`}>
                {i > 0 && <span className="text-muted-foreground">›</span>}
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
      <div className="ml-auto flex shrink-0 items-center gap-2 md:gap-3">
        {actions}
        <ThemeToggle />
        <SearchBox />
      </div>
    </header>
  );
}
