"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TABLE_PARAMS } from "@/lib/table-state";

export const POOL_PARAMS = ["lock", "x", "st", "qb", "bb", "rand", "exp", "n", "tab"] as const;

export type PoolState = {
  locked: string[];
  excluded: string[];
  stacked: string[];
  qbStackTeam: string;
  bringBackTeam: string;
  randomness: number;
  maxExposure: number;
  nLineups: number;
  tab: "build" | "sim";
};

export const DEFAULT_POOL: PoolState = {
  locked: [],
  excluded: [],
  stacked: [],
  qbStackTeam: "",
  bringBackTeam: "",
  randomness: 25,
  maxExposure: 0.4,
  nLineups: 5,
  tab: "build",
};

function csvIds(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function uniq(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

export function parsePoolState(sp: URLSearchParams): PoolState {
  const rand = Number(sp.get("rand") ?? "");
  const exp = Number(sp.get("exp") ?? "");
  const n = Number(sp.get("n") ?? "");
  const tab = sp.get("tab");
  return {
    locked: csvIds(sp.get("lock") ?? ""),
    excluded: csvIds(sp.get("x") ?? ""),
    stacked: csvIds(sp.get("st") ?? ""),
    qbStackTeam: (sp.get("qb") ?? "").toUpperCase(),
    bringBackTeam: (sp.get("bb") ?? "").toUpperCase(),
    randomness: Number.isFinite(rand) && rand >= 0 ? rand : DEFAULT_POOL.randomness,
    maxExposure: Number.isFinite(exp) && exp > 0 ? Math.min(1, exp / 100) : DEFAULT_POOL.maxExposure,
    nLineups: Number.isInteger(n) && n >= 1 ? Math.min(50, n) : DEFAULT_POOL.nLineups,
    tab: tab === "sim" ? "sim" : "build",
  };
}

export function poolStateToParams(state: PoolState, base: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base.toString());
  for (const k of POOL_PARAMS) p.delete(k);
  if (state.locked.length) p.set("lock", state.locked.join(","));
  if (state.excluded.length) p.set("x", state.excluded.join(","));
  if (state.stacked.length) p.set("st", state.stacked.join(","));
  if (state.qbStackTeam) p.set("qb", state.qbStackTeam);
  if (state.bringBackTeam) p.set("bb", state.bringBackTeam);
  if (state.randomness !== DEFAULT_POOL.randomness) p.set("rand", String(state.randomness));
  if (state.maxExposure !== DEFAULT_POOL.maxExposure) p.set("exp", String(Math.round(state.maxExposure * 100)));
  if (state.nLineups !== DEFAULT_POOL.nLineups) p.set("n", String(state.nLineups));
  if (state.tab === "sim") p.set("tab", "sim");
  return p;
}

export function applyLock(state: PoolState, id: string): PoolState {
  const locked = toggleId(state.locked, id);
  return {
    ...state,
    locked,
    excluded: state.excluded.filter((x) => x !== id),
  };
}

export function applyExclude(state: PoolState, id: string): PoolState {
  const excluded = toggleId(state.excluded, id);
  return {
    ...state,
    excluded,
    locked: state.locked.filter((x) => x !== id),
    stacked: state.stacked.filter((x) => x !== id),
  };
}

export function applyStack(
  state: PoolState,
  id: string,
  team: string | null,
  position: string | null,
): PoolState {
  const stacked = toggleId(state.stacked, id);
  const adding = stacked.includes(id);
  const next: PoolState = {
    ...state,
    stacked,
    excluded: state.excluded.filter((x) => x !== id),
  };
  if (!adding) return next;
  const pos = (position ?? "").toUpperCase();
  const t = (team ?? "").toUpperCase();
  if (!t || pos === "DST") return next;
  if (!next.qbStackTeam) next.qbStackTeam = t;
  else if (t !== next.qbStackTeam && !next.bringBackTeam) next.bringBackTeam = t;
  return next;
}

export function requiredIds(state: PoolState): string[] {
  return uniq([...state.locked, ...state.stacked]);
}

export function usePoolState(): [PoolState, (patch: Partial<PoolState> | ((s: PoolState) => PoolState)) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [state, setLocal] = useState<PoolState>(() => parsePoolState(sp));

  const set = useCallback(
    (patch: Partial<PoolState> | ((s: PoolState) => PoolState)) => {
      setLocal((prev) => {
        const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
        const params = poolStateToParams(next, new URLSearchParams(sp.toString()));
        for (const k of TABLE_PARAMS) {
          if (!params.has(k) && sp.get(k)) params.set(k, sp.get(k)!);
        }
        const qs = params.toString();
        router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
        return next;
      });
    },
    [router, pathname, sp],
  );

  return [state, set];
}
