import { CURRENT_SEASON } from "@/lib/config";
import { LeagueHeader } from "@/components/league/LeagueHeader";
import { TxnSummary } from "@/components/league/TxnSummary";
import { TxnWeekTabs } from "@/components/league/TxnWeekTabs";
import {
  filterTransactions,
  groupTransactions,
  parseSeason,
  parseTeamId,
  txnSummary,
  txnTypeLabel,
  TXN_TYPES,
} from "@/lib/league";
import { leagueTeams, leagueTransactions, leagueWeekStates } from "@/lib/queries/league";

export const metadata = { title: "LOC transactions" };
export const dynamic = "force-dynamic";

function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function Page({ searchParams }: PageProps<"/league/transactions">) {
  const sp = await searchParams;
  const season = parseSeason(sp.season);
  const team = parseTeamId(sp.team);
  const typeRaw = one(sp.type);
  const type = (TXN_TYPES as readonly string[]).includes(typeRaw ?? "") ? typeRaw! : null;
  const [teams, all, weekStates] = await Promise.all([
    leagueTeams(season),
    leagueTransactions(season),
    leagueWeekStates(season),
  ]);
  const groups = groupTransactions(filterTransactions(all, { team, type }));
  return (
    <>
      <LeagueHeader season={season} title="Transactions" />
      <TxnSummary rows={txnSummary(all)} season={season} />
      <form method="get" className="flex flex-wrap items-end gap-3">
        {season !== CURRENT_SEASON ? <input type="hidden" name="season" value={season} /> : null}
        <label className="flex flex-col gap-1">
          <span className="t-colhead text-muted-foreground">Team</span>
          <select name="team" defaultValue={team ?? ""} className="h-8 rounded-md border border-border bg-card px-2 t-body">
            <option value="">All</option>
            {teams.map((t) => (
              <option key={t.espn_team_id} value={t.espn_team_id}>{t.team}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-colhead text-muted-foreground">Type</span>
          <select name="type" defaultValue={type ?? ""} className="h-8 rounded-md border border-border bg-card px-2 t-body">
            <option value="">All</option>
            {TXN_TYPES.map((t) => (
              <option key={t} value={t}>{txnTypeLabel(t)}</option>
            ))}
          </select>
        </label>
        <button type="submit" className="h-8 rounded-md border border-border bg-card px-3 t-body font-semibold hover:bg-accent">
          Apply
        </button>
      </form>
      {groups.length === 0 ? (
        <p className="t-sentence text-muted-foreground">
          {all.length === 0
            ? "No transactions are stored for this season. Run nfl-edge ingest espn-league."
            : "No transactions match that team or type."}
        </p>
      ) : (
        <TxnWeekTabs weeks={weekStates.map((w) => w.week)} groups={groups} />
      )}
    </>
  );
}
