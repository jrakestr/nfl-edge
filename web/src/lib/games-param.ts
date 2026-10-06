/** `games=` multi-select: full game_ids, comma-separated, sorted canonically. */

export function parseGames(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))].sort();
}

export function serializeGames(ids: readonly string[]): string {
  const next = [...new Set(ids.map((s) => s.trim()).filter(Boolean))].sort();
  return next.join(",");
}

export function toggleGame(selected: readonly string[], id: string): string[] {
  const set = new Set(selected);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  return [...set].sort();
}

/** If every id in `windowIds` is selected, drop them; otherwise add them. */
export function toggleWindow(selected: readonly string[], windowIds: readonly string[]): string[] {
  const set = new Set(selected);
  const allOn = windowIds.length > 0 && windowIds.every((id) => set.has(id));
  if (allOn) {
    for (const id of windowIds) set.delete(id);
  } else {
    for (const id of windowIds) set.add(id);
  }
  return [...set].sort();
}

/** Ids that are both selected and on the current slate. Empty → do not filter. */
export function selectedOnSlate(selected: readonly string[], slateIds: readonly string[]): string[] {
  const vis = new Set(slateIds);
  return selected.filter((id) => vis.has(id));
}

export function applyGamesToParams(ids: readonly string[], base: URLSearchParams): URLSearchParams {
  const p = new URLSearchParams(base.toString());
  const raw = serializeGames(ids);
  if (raw) p.set("games", raw);
  else p.delete("games");
  return p;
}
