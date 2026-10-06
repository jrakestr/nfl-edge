"use client";

import { useEffect } from "react";
import { selectedOnSlate } from "@/lib/games-param";
import { useGamesSelection } from "@/components/shell/GamesSelection";

/** Hides server-rendered `[data-game]` nodes. Does not take verdict props. */
export function BoardGamesFilter() {
  const { selected } = useGamesSelection();

  useEffect(() => {
    const nodes = [...document.querySelectorAll<HTMLElement>("[data-game]")];
    const ids = nodes.map((n) => n.dataset.game ?? "").filter(Boolean);
    const active = new Set(selectedOnSlate(selected, ids));
    const hide = active.size > 0;
    for (const n of nodes) {
      const id = n.dataset.game ?? "";
      n.hidden = hide && !active.has(id);
    }
    return () => {
      for (const n of nodes) n.hidden = false;
    };
  }, [selected]);

  return null;
}
