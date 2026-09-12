"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/** Bind the open game to `?game=` so WeekBoard can stay a server component. */
export function useGameOpen() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return useCallback(
    (id: string | null) => {
      const p = new URLSearchParams(params.toString());
      if (id) p.set("game", id);
      else p.delete("game");
      const qs = p.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, pathname, params],
  );
}
