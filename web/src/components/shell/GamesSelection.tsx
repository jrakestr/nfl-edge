"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { applyGamesToParams, parseGames, serializeGames } from "@/lib/games-param";

type GamesSelection = {
  selected: string[];
  setSelected: (ids: readonly string[]) => void;
};

const GamesSelectionContext = createContext<GamesSelection | null>(null);

function writeGamesToHistory(ids: readonly string[]) {
  if (typeof window === "undefined") return;
  const p = applyGamesToParams(ids, new URLSearchParams(window.location.search));
  const qs = p.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", next);
}

export function GamesSelectionProvider({ children }: { children: ReactNode }) {
  const sp = useSearchParams();
  const [selected, setLocal] = useState(() => parseGames(sp.get("games")));

  const setSelected = useCallback((ids: readonly string[]) => {
    const next = parseGames(serializeGames(ids));
    setLocal(next);
    writeGamesToHistory(next);
  }, []);

  const value = useMemo(() => ({ selected, setSelected }), [selected, setSelected]);
  return <GamesSelectionContext.Provider value={value}>{children}</GamesSelectionContext.Provider>;
}

const FALLBACK: GamesSelection = { selected: [], setSelected: () => {} };

export function useGamesSelection(): GamesSelection {
  return useContext(GamesSelectionContext) ?? FALLBACK;
}

/** Router params with live `games=` from the provider overlaid. Falls back to the router when unwrapped. */
export function useLiveSearchParams(): URLSearchParams {
  const sp = useSearchParams();
  const ctx = useContext(GamesSelectionContext);
  return useMemo(() => {
    const base = new URLSearchParams(sp.toString());
    if (!ctx) return base;
    return applyGamesToParams(ctx.selected, base);
  }, [sp, ctx]);
}
