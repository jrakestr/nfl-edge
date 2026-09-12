"use client";

import { useCallback, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/** Board / week keys that table state must never write or delete. */
export const PRESERVED_PARAMS = ["view", "run", "season", "min", "flat", "slot", "slate"] as const;

export const TABLE_PARAMS = ["sort", "dir", "q", "pos", "team", "game", "salMin", "salMax", "minProj"] as const;

export type TableDir = "asc" | "desc";

export type TableState = {
  sort: string | null;
  dir: TableDir;
  q: string;
  pos: string;
  team: string;
  game: string;
  salMin: string;
  salMax: string;
  minProj: string;
};

export const DEFAULT_TABLE_STATE: TableState = {
  sort: null,
  dir: "desc",
  q: "",
  pos: "",
  team: "",
  game: "",
  salMin: "",
  salMax: "",
  minProj: "",
};

function one(sp: URLSearchParams, key: string): string {
  return sp.get(key) ?? "";
}

export function parseTableState(sp: URLSearchParams): TableState {
  const dir = one(sp, "dir");
  return {
    sort: one(sp, "sort") || null,
    dir: dir === "asc" ? "asc" : "desc",
    q: one(sp, "q"),
    pos: one(sp, "pos"),
    team: one(sp, "team"),
    game: one(sp, "game"),
    salMin: one(sp, "salMin"),
    salMax: one(sp, "salMax"),
    minProj: one(sp, "minProj"),
  };
}

export function tableStateToParams(state: TableState, base: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base.toString());
  for (const k of TABLE_PARAMS) p.delete(k);
  if (state.sort) p.set("sort", state.sort);
  if (state.sort && state.dir === "asc") p.set("dir", "asc");
  else if (state.sort && state.dir === "desc") p.set("dir", "desc");
  if (state.q) p.set("q", state.q);
  if (state.pos) p.set("pos", state.pos);
  if (state.team) p.set("team", state.team);
  if (state.game) p.set("game", state.game);
  if (state.salMin) p.set("salMin", state.salMin);
  if (state.salMax) p.set("salMax", state.salMax);
  if (state.minProj) p.set("minProj", state.minProj);
  return p;
}

export function useTableState(syncUrl = true): [TableState, (patch: Partial<TableState>) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [state, setLocal] = useState<TableState>(() =>
    syncUrl ? parseTableState(sp) : { ...DEFAULT_TABLE_STATE },
  );

  const set = useCallback(
    (patch: Partial<TableState>) => {
      setLocal((prev) => {
        const next = { ...prev, ...patch };
        if (syncUrl) {
          const params = tableStateToParams(next, new URLSearchParams(sp.toString()));
          const qs = params.toString();
          router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
        }
        return next;
      });
    },
    [syncUrl, router, pathname, sp],
  );

  return [state, set];
}
