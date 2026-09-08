"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { NAV } from "@/lib/config";
import { NAV_ICONS } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useSidebarFooter } from "./PageActions";

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
      className="glass sticky top-0 flex h-screen w-[var(--sidebar-width)] shrink-0 flex-col border-r transition-[width] duration-[var(--dur-2)] ease-[var(--ease)]"
      aria-label="Primary"
    >
      <div
        className={cn(
          "flex h-[var(--topbar-height)] items-center gap-1",
          collapsed ? "justify-center px-1" : "px-2",
        )}
      >
        {!collapsed && (
          <Link href="/" className="t-title min-w-0 flex-1 truncate px-2 text-[15px] leading-5 tracking-tight">
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
      <nav className={cn("flex flex-1 flex-col gap-0.5 pt-2", collapsed ? "px-1" : "px-2")}>
        {NAV.map((item) => {
          const active = item.match.test(pathname);
          const Icon = NAV_ICONS[item.icon];
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              title={item.label}
              className={cn(
                "flex h-9 items-center rounded-md t-body transition-colors duration-[var(--dur-1)]",
                collapsed ? "justify-center px-0" : "gap-2 px-3",
                active
                  ? "bg-accent text-foreground font-semibold"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon size={16} strokeWidth={1.5} aria-hidden className="shrink-0" />
              <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className={cn("border-t border-border-soft p-3", collapsed && "hidden")}>
        {registered ?? footer ?? <span className="t-caption">no run loaded</span>}
      </div>
    </aside>
  );
}
