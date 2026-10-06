"use client";

import { useCallback } from "react";
import { useUrlBoundState } from "@/lib/url-bound-state";

/** Board / week keys that table state must never write or delete. */
export const PRESERVED_PARAMS = [
  "view",
  "density",
  "run",
  "season",
  "min",
  "flat",
  "slot",
  "slate",
  "lock",
  "excl",
  "stack",
  "lineups",
  "cap",
  "minSalary",
  "maxExp",
  "maxTeam",
  "rand",
  "stackN",
  "bringBack",
  "noQbDst",
  "flexRB",
  "flexWR",
  "flexTE",
  "reqStack",
  "games",
] as const;

export const TABLE_PARAMS = [
  "sort",
  "dir",
  "q",
  "pos",
  "team",
  "game",
  "salMin",
  "salMax",
  "minProj",
  "showunproj",
  "pool",
  "health",
] as const;

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
  showunproj: string;
  pool: string;
  health: string;
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
  showunproj: "",
  pool: "",
  health: "",
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
    showunproj: one(sp, "showunproj"),
    pool: one(sp, "pool"),
    health: one(sp, "health"),
  };
}

export function tableStateToParams(state: TableState, base: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base.toString());
  for (const k of TABLE_PARAMS) p.delete(k);
  if (state.sort) p.set("sort", state.sort);
  if (state.dir === "asc") p.set("dir", "asc");
  else if (state.sort) p.set("dir", "desc");
  if (state.q) p.set("q", state.q);
  if (state.pos) p.set("pos", state.pos);
  if (state.team) p.set("team", state.team);
  if (state.game) p.set("game", state.game);
  if (state.salMin) p.set("salMin", state.salMin);
  if (state.salMax) p.set("salMax", state.salMax);
  if (state.minProj) p.set("minProj", state.minProj);
  if (state.showunproj) p.set("showunproj", state.showunproj);
  if (state.pool) p.set("pool", state.pool);
  if (state.health) p.set("health", state.health);
  return p;
}

const TABLE_DEBOUNCE_KEYS = ["q", "salMin", "salMax", "minProj"] as const;

export function useTableState(syncUrl = true): [TableState, (patch: Partial<TableState>) => void] {
  const [state, setState] = useUrlBoundState({
    parse: parseTableState,
    apply: tableStateToParams,
    enabled: syncUrl,
    debounceMs: 300,
    debounceKeys: TABLE_DEBOUNCE_KEYS,
  });

  const set = useCallback((patch: Partial<TableState>) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, [setState]);

  return [state, set];
}
