"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NAV } from "@/lib/config";
import { cn } from "@/lib/utils";

export function Sidebar({ footer }: { footer?: ReactNode }) {
  const pathname = usePathname() ?? "/";
  return (
    <aside
      className="sticky top-0 flex h-screen w-[var(--sidebar-width)] shrink-0 flex-col border-r border-border bg-card"
      aria-label="Primary"
    >
      <div className="flex h-[var(--topbar-height)] items-center px-4">
        <Link href="/" className="t-title text-[15px] leading-5 tracking-tight">
          nfl-edge
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-2 pt-2">
        {NAV.map((item) => {
          const active = item.match.test(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 items-center rounded-md px-3 t-body transition-colors duration-[var(--dur-1)]",
                active
                  ? "bg-accent text-foreground font-semibold"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border-soft p-3">
        {footer ?? <span className="t-caption">no run loaded</span>}
      </div>
    </aside>
  );
}
