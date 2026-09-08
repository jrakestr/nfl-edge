"use client";

import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { SIDEBAR_COLLAPSED_KEY } from "@/lib/config";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { PageActionsProvider } from "./PageActions";

const SIDEBAR_EVENT = "nfl-edge-sidebar-collapsed";

function subscribe(cb: () => void) {
  window.addEventListener(SIDEBAR_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(SIDEBAR_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function getSnapshot() {
  return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
}

function getServerSnapshot() {
  return false;
}

/**
 * App shell (design-system → Patterns → App shell): 216px sidebar / 64px collapsed rail,
 * 52px top bar, content grid with 20px padding and 16px gaps. `sidebarFooter` is where the
 * RunBadge is pinned; the board wires a live one in, the shell itself stays data-free.
 */
export function AppShell({
  children,
  sidebarFooter,
}: {
  children: ReactNode;
  sidebarFooter?: ReactNode;
}) {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = useCallback(() => {
    const next = !collapsed;
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
    window.dispatchEvent(new Event(SIDEBAR_EVENT));
  }, [collapsed]);

  return (
    <PageActionsProvider>
      <div
        className="flex min-h-screen"
        data-sidebar-collapsed={collapsed ? "true" : "false"}
        suppressHydrationWarning
      >
        <Sidebar collapsed={collapsed} onToggle={toggle} footer={sidebarFooter} />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 p-5">
            <div className="mx-auto flex max-w-[1280px] flex-col gap-4">{children}</div>
          </main>
        </div>
      </div>
    </PageActionsProvider>
  );
}
