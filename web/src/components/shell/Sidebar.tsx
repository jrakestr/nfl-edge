"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLiveSearchParams } from "./GamesSelection";
import { Suspense, type ReactNode } from "react";
import { NAV, NAV_GROUPS } from "@/lib/config";
import { NAV_ICONS } from "@/lib/icons";
import { navHref, pathContext } from "@/lib/slate";
import { cn } from "@/lib/utils";
import { useSidebarFooter } from "./PageActions";

function NavItems({
  collapsed,
  pathname,
  querySlate,
  search,
}: {
  collapsed: boolean;
  pathname: string;
  querySlate?: string | null;
  search?: URLSearchParams | null;
}) {
  const ctx = pathContext(pathname, querySlate);
  return (
    <>
      {NAV_GROUPS.map((group, index) => (
        <div key={group} className="flex flex-col gap-0.5">
          <p className={cn("t-colhead px-3 text-muted-foreground", index === 0 ? "pt-1" : "pt-3", collapsed && "sr-only")}>
            {group}
          </p>
          {NAV.filter((item) => item.group === group).map((item) => {
            const active = item.match.test(pathname);
            const Icon = NAV_ICONS[item.icon];
            return (
              <Link
                key={item.href}
                href={navHref(item.label, ctx, item.href, search)}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                title={item.label}
                className={cn(
                  "relative flex h-9 items-center rounded-md t-body transition-colors duration-[var(--dur-1)]",
                  collapsed ? "justify-center px-0" : "gap-2 px-3",
                  active
                    ? "bg-accent font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {active ? (
                  <span aria-hidden className="absolute top-2 bottom-2 left-1 w-0.5 rounded-full bg-foreground" />
                ) : null}
                <Icon size={16} strokeWidth={1.5} aria-hidden className="shrink-0" />
                <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </>
  );
}

function SlateNav({ collapsed, pathname }: { collapsed: boolean; pathname: string }) {
  const sp = useLiveSearchParams();
  return (
    <NavItems collapsed={collapsed} pathname={pathname} querySlate={sp.get("slate")} search={sp} />
  );
}

export function Sidebar({
  collapsed,
  onToggle,
  footer,
}: {
  collapsed: boolean;
  onToggle: () => void;
  footer?: ReactNode;
}) {
  const pathname = usePathname() ?? "/";
  const registered = useSidebarFooter();
  return (
    <aside
      className="sticky top-0 flex h-screen w-[var(--sidebar-width)] shrink-0 flex-col border-r bg-card transition-[width] duration-[var(--dur-2)] ease-[var(--ease)]"
      aria-label="Primary"
    >
      <div
        className={cn(
          "flex h-[var(--topbar-height)] items-center gap-1",
          collapsed ? "justify-center px-1" : "px-2",
        )}
      >
        {!collapsed && (
          <Link href="/" className="t-sentence min-w-0 flex-1 truncate px-2 font-semibold tracking-tight">
            nfl-edge
          </Link>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {collapsed ? (
            <PanelLeftOpen size={16} strokeWidth={1.5} aria-hidden />
          ) : (
            <PanelLeftClose size={16} strokeWidth={1.5} aria-hidden />
          )}
        </button>
      </div>
      <nav className={cn("flex flex-1 flex-col gap-0.5 overflow-y-auto border-t border-border-soft pt-2", collapsed ? "px-1" : "px-2")}>
        <Suspense fallback={<NavItems collapsed={collapsed} pathname={pathname} />}>
          <SlateNav collapsed={collapsed} pathname={pathname} />
        </Suspense>
      </nav>
      <div className={cn("border-t border-border-soft p-3", collapsed && "hidden")}>
        {registered ?? footer ?? <span className="t-caption">no run loaded</span>}
      </div>
    </aside>
  );
}
