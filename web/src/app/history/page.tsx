import { ContestHistory } from "@/components/history/ContestHistory";
import { summarizeHistory } from "@/lib/contest-history";
import { historyEntries } from "@/lib/queries/contest-history";

export const metadata = { title: "Contest history" };
export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const sport = one(sp.sport)?.trim() || "NFL";
  const gameType = one(sp.type)?.trim() || "Classic";

  const { entries, options } = await historyEntries(sport);
  const summary = summarizeHistory(entries, { sport, gameType });

  return <ContestHistory summary={summary} sport={sport} gameType={gameType} options={options} />;
}
