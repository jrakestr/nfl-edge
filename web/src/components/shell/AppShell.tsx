import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { PageActionsProvider } from "./PageActions";

/**
 * App shell (design-system → Patterns → App shell): 216px white sidebar, 52px top bar,
 * content grid with 20px padding and 16px gaps. `sidebarFooter` is where the RunBadge
 * is pinned; the board wires a live one in, the shell itself stays data-free.
 */
export function AppShell({
  children,
  sidebarFooter,
}: {
  children: ReactNode;
  sidebarFooter?: ReactNode;
}) {
  return (
    <PageActionsProvider>
      <div className="flex min-h-screen">
        <Sidebar footer={sidebarFooter} />
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
