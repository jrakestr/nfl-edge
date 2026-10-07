"use client";

import { Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Player search field. `/` focuses it from anywhere (design-system → Accessibility). Under `md`
 * it is an icon that opens the field as a full-width bar over the top bar.
 */
export function SearchBox() {
  const ref = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div
      className={cn(
        "relative",
        open &&
          "max-md:fixed max-md:inset-x-0 max-md:top-0 max-md:z-20 max-md:flex max-md:h-[var(--topbar-height)] max-md:items-center max-md:border-b max-md:bg-card max-md:px-3",
      )}
    >
      <button
        type="button"
        aria-label="Open search"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => ref.current?.focus());
        }}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:hidden",
          open && "hidden",
        )}
      >
        <Search size={18} strokeWidth={1.5} aria-hidden />
      </button>
      <Input
        ref={ref}
        type="search"
        placeholder="Search players"
        aria-label="Search players"
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        className={cn(
          "h-8 rounded-md bg-background t-body placeholder:text-muted-foreground md:w-56",
          open ? "w-full" : "max-md:hidden",
        )}
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-sm border border-border bg-card px-1 t-caption max-md:hidden">
        /
      </kbd>
    </div>
  );
}
