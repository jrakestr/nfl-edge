"use client";

import {
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLiveSearchParams } from "@/components/shell/GamesSelection";
import { canonicalSearch } from "@/lib/search-canonical";

export type UrlBoundOptions<T extends object> = {
  parse: (sp: URLSearchParams) => T;
  apply: (state: T, base: URLSearchParams) => URLSearchParams;
  enabled?: boolean;
  debounceMs?: number;
  debounceKeys?: readonly (keyof T)[];
};

function changedKeys<T extends object>(prev: T, next: T): (keyof T)[] {
  const keys = new Set<keyof T>([
    ...(Object.keys(prev) as (keyof T)[]),
    ...(Object.keys(next) as (keyof T)[]),
  ]);
  const out: (keyof T)[] = [];
  for (const k of keys) {
    if (!Object.is(prev[k], next[k])) out.push(k);
  }
  return out;
}

export function useUrlBoundState<T extends object>({
  parse,
  apply,
  enabled = true,
  debounceMs,
  debounceKeys,
}: UrlBoundOptions<T>): [T, Dispatch<SetStateAction<T>>] {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const live = useLiveSearchParams();
  const liveStr = live.toString();
  const liveCanon = canonicalSearch(liveStr);

  const [state, setState] = useState<T>(() =>
    enabled ? parse(sp) : parse(new URLSearchParams()),
  );

  const lastWrittenRef = useRef(liveCanon);
  const lastSeenLiveRef = useRef(liveCanon);
  const prevStateRef = useRef(state);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parseRef = useRef(parse);
  const applyRef = useRef(apply);
  const debounceKeysRef = useRef(debounceKeys);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    parseRef.current = parse;
    applyRef.current = apply;
    debounceKeysRef.current = debounceKeys;

    const clearTimer = () => {
      if (timerRef.current != null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    if (!enabled) {
      prevStateRef.current = state;
      lastSeenLiveRef.current = liveCanon;
      return;
    }

    const liveChanged = liveCanon !== lastSeenLiveRef.current;
    lastSeenLiveRef.current = liveCanon;

    if (liveChanged && liveCanon !== lastWrittenRef.current) {
      clearTimer();
      const next = parseRef.current(new URLSearchParams(liveStr));
      lastWrittenRef.current = liveCanon;
      prevStateRef.current = next;
      setState(next);
      return;
    }

    if (liveCanon !== lastWrittenRef.current) {
      return;
    }

    const applied = applyRef.current(state, new URLSearchParams(liveStr)).toString();
    const appliedCanon = canonicalSearch(applied);
    const prev = prevStateRef.current;
    const stateChanged = prev !== state;
    prevStateRef.current = state;

    if (!stateChanged || appliedCanon === liveCanon) {
      return;
    }

    const href = `${pathname}${applied ? `?${applied}` : ""}`;
    const write = () => {
      lastWrittenRef.current = appliedCanon;
      router.replace(href, { scroll: false });
    };

    const keys = changedKeys(prev, state);
    const keysDebounced = debounceKeysRef.current;
    const debounce =
      debounceMs != null &&
      debounceMs > 0 &&
      !!keysDebounced?.length &&
      keys.length > 0 &&
      keys.every((k) => keysDebounced.includes(k));

    if (debounce) {
      clearTimer();
      timerRef.current = setTimeout(write, debounceMs);
      return clearTimer;
    }

    clearTimer();
    write();
  }, [apply, debounceKeys, debounceMs, enabled, liveCanon, liveStr, parse, pathname, router, state]);

  return [state, setState];
}
