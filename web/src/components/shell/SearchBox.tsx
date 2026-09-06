"use client";

import { useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

/** Player search field. `/` focuses it from anywhere (design-system → Accessibility). */
export function SearchBox() {
  const ref = useRef<HTMLInputElement>(null);
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
    <div className="relative">
      <Input
        ref={ref}
        type="search"
        placeholder="Search players"
        aria-label="Search players"
        className="h-8 w-56 rounded-md bg-background text-[13px] placeholder:text-dim"
      />
      <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-sm border border-border bg-card px-1 t-caption leading-4">
        /
      </kbd>
    </div>
  );
}
