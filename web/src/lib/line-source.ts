/** Plain-words market-line source. Never show snake_case field names. */
export function lineSourceLabel(source?: string | null, bookmaker?: string | null): string {
  if (source === "odds_api" && bookmaker === "draftkings") return "DraftKings";
  return "schedule lines";
}
