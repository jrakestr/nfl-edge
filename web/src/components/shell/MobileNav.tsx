"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState } from "react";
import { NavItems, SlateNav } from "./Sidebar";
import { useSidebarFooter } from "./PageActions";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

/** Navigation under `md`: the sidebar is hidden and this sheet carries the same links and run badge. */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname() ?? "/";
  const footer = useSidebarFooter();
  const close = () => setOpen(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Open navigation"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
        >
          <Menu size={18} strokeWidth={1.5} aria-hidden />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="gap-0 p-0 data-[side=left]:w-[280px] data-[side=left]:max-w-[85vw] data-[side=left]:sm:max-w-[280px]">
        <SheetHeader className="h-[var(--topbar-height)] justify-center border-b border-border-soft px-4 py-0">
          <SheetTitle asChild>
            <Link href="/" onClick={close} className="t-sentence tracking-tight">
              nfl-edge
            </Link>
          </SheetTitle>
          <SheetDescription className="sr-only">Primary navigation</SheetDescription>
        </SheetHeader>
        <nav aria-label="Primary" className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2">
          <Suspense fallback={<NavItems collapsed={false} pathname={pathname} onNavigate={close} />}>
            <SlateNav collapsed={false} pathname={pathname} onNavigate={close} />
          </Suspense>
        </nav>
        <div className="border-t border-border-soft p-3">
          {footer ?? <span className="t-caption">no run loaded</span>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
