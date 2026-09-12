"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export const PICK_PARAMS = ["lock", "excl", "stack"] as const;
export type PickKey = (typeof PICK_PARAMS)[number];

export type SlatePicks = {
  lock: string[];
  excl: string[];
  stack: string[];
};

export function emptyPicks(): SlatePicks {
  return { lock: [], excl: [], stack: [] };
}

export function slateStorageKey(slateId: string): string {
  return `nfl-edge.slate:${slateId}`;
}

export function parseIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}

export function parsePicks(sp: URLSearchParams): SlatePicks {
  return {
    lock: parseIds(sp.get("lock")),
    excl: parseIds(sp.get("excl")),
    stack: parseIds(sp.get("stack")),
  };
}

export function urlHasPicks(sp: URLSearchParams): boolean {
  return PICK_PARAMS.some((k) => sp.has(k));
}

export function loadStoredPicks(slateId: string): SlatePicks | null {
  if (!slateId || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(slateStorageKey(slateId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SlatePicks>;
    return {
      lock: Array.isArray(parsed.lock) ? parsed.lock.map(String) : [],
      excl: Array.isArray(parsed.excl) ? parsed.excl.map(String) : [],
      stack: Array.isArray(parsed.stack) ? parsed.stack.map(String) : [],
    };
  } catch {
    return null;
  }
}

export function storePicks(slateId: string, picks: SlatePicks): void {
  if (!slateId || typeof localStorage === "undefined") return;
  localStorage.setItem(slateStorageKey(slateId), JSON.stringify(picks));
}

/** URL wins when any pick param is present so a locked view is shareable. */
export function picksFromUrlOrStorage(sp: URLSearchParams, slateId: string): SlatePicks {
  if (urlHasPicks(sp)) return parsePicks(sp);
  return loadStoredPicks(slateId) ?? emptyPicks();
}

export function applyPicksToParams(picks: SlatePicks, base: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base.toString());
  for (const k of PICK_PARAMS) {
    const ids = picks[k];
    if (ids.length) p.set(k, ids.join(","));
    else p.delete(k);
  }
  return p;
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

export function toggleLock(picks: SlatePicks, id: string): SlatePicks {
  const lock = toggleId(picks.lock, id);
  return {
    ...picks,
    lock,
    excl: lock.includes(id) ? picks.excl.filter((x) => x !== id) : picks.excl,
  };
}

export function toggleExcl(picks: SlatePicks, id: string): SlatePicks {
  const excl = toggleId(picks.excl, id);
  return {
    ...picks,
    excl,
    lock: excl.includes(id) ? picks.lock.filter((x) => x !== id) : picks.lock,
  };
}

export function toggleStack(picks: SlatePicks, id: string): SlatePicks {
  return { ...picks, stack: toggleId(picks.stack, id) };
}

export function useSlatePicks(slateId: string): {
  picks: SlatePicks;
  setPicks: (next: SlatePicks) => void;
  toggle: (key: PickKey, id: string) => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [picks, setLocal] = useState<SlatePicks>(() => parsePicks(sp));
  const hydrated = useRef(false);

  const setPicks = useCallback(
    (next: SlatePicks) => {
      setLocal(next);
      storePicks(slateId, next);
      const params = applyPicksToParams(next, new URLSearchParams(sp.toString()));
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [pathname, router, slateId, sp],
  );

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const next = picksFromUrlOrStorage(sp, slateId);
    setLocal(next);
    if (urlHasPicks(sp)) {
      storePicks(slateId, next);
      return;
    }
    if (next.lock.length || next.excl.length || next.stack.length) {
      storePicks(slateId, next);
      const params = applyPicksToParams(next, new URLSearchParams(sp.toString()));
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    }
  }, [pathname, router, slateId, sp]);

  const toggle = useCallback(
    (key: PickKey, id: string) => {
      setPicks(
        key === "lock" ? toggleLock(picks, id) : key === "excl" ? toggleExcl(picks, id) : toggleStack(picks, id),
      );
    },
    [picks, setPicks],
  );

  return { picks, setPicks, toggle };
}
