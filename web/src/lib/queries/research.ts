import { sql } from "@/lib/db";
import { slateId } from "@/lib/queries/dfs";
import {
  composeLineupAudit,
  evaluatePlayerVerdict,
  type AuditedLineup,
  type PoolPlayer,
  type RawJudgment,
} from "@/lib/research/questions";
import type { LabPlayer, Metric, Normalize, Term } from "@/lib/research/score";

export type ResearchBuild = {
  players: LabPlayer[];
  /** Field keys present on the build, in a stable order. */
  fields: string[];
  builtAt: string | null;
};

/** Weeks with a complete research build for the season, ascending. */
export async function researchWeeks(season: number): Promise<number[]> {
  const rows = await sql()`
    select distinct week from model.research_fields where season = ${season} order by week`;
  return rows.map((r) => Number(r.week));
}

/** As-of player fields for one target week (built from weeks before it). Null when not built. */
export async function researchBuild(season: number, week: number): Promise<ResearchBuild | null> {
  const rows = await sql()`
    select player_id, full_name, team, position, fields, built_at
    from model.research_fields
    where season = ${season} and week = ${week}
    order by team, position, full_name`;
  if (rows.length === 0) return null;
  const keys = new Set<string>();
  let builtAt: string | null = null;
  const players = rows.map((r) => {
    const raw = (r.fields ?? {}) as Record<string, unknown>;
    const fields: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(raw)) {
      keys.add(k);
      fields[k] = typeof v === "number" && Number.isFinite(v) ? v : null;
    }
    const at = r.built_at instanceof Date ? r.built_at.toISOString() : r.built_at ? String(r.built_at) : null;
    if (at && (!builtAt || at > builtAt)) builtAt = at;
    return {
      playerId: String(r.player_id),
      name: String(r.full_name),
      team: String(r.team),
      position: String(r.position),
      fields,
    };
  });
  return { players, fields: [...keys].sort(), builtAt };
}

function parseTerms(raw: unknown): Term[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((t) => {
    const o = t as { field?: unknown; weight?: unknown } | null;
    return typeof o?.field === "string" && typeof o.weight === "number"
      ? [{ field: o.field, weight: o.weight }]
      : [];
  });
}

export async function researchMetrics(): Promise<Metric[]> {
  const rows = await sql()`
    select id, name, terms, normalize from model.research_metrics order by id`;
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    terms: parseTerms(r.terms),
    normalize: (r.normalize === "zscore" ? "zscore" : "none") as Normalize,
  }));
}

export type SlateAuditSnapshot = {
  slate: string;
  slateId: string;
  runId: string | null;
  auditedAt: string | null;
  modelResolved: string | null;
  auditedPlayerCount: number;
  poolByPid: Record<string, PoolPlayer>;
  lineups: AuditedLineup[];
};

/**
 * Load Jev judgments, latest news headlines, salary pool, and saved lineups for a slate,
 * then compose deterministic per-player verdicts and per-lineup audits.
 * Display-only: never invokes Jev or modifies simulator projections.
 */
export async function slateLineupAudit(
  season: number,
  week: number,
  site = "dk",
  slate = "main",
): Promise<SlateAuditSnapshot> {
  const sid = slateId(season, week, slate);

  const [runRows, jRows, salRows, newsRows] = await Promise.all([
    sql()`
      select r.run_id::text as run_id
      from model.sim_runs r
      where r.season = ${season} and r.week = ${week}
      order by r.created_at desc
      limit 1`,
    sql()`
      select distinct on (j.player_id, j.question_id)
             j.player_id, j.question_id, j.kind,
             j.value::float8 as value,
             j.confidence::float8 as confidence,
             j.model_resolved, j.created_at
      from model.jev_judgments j
      where j.season = ${season} and j.week = ${week} and j.slate in (${slate}, ${sid})
      order by j.player_id, j.question_id, j.created_at desc`,
    sql()`
      select distinct on (s.player_id)
             s.player_id, s.player_dk_id, s.name, s.team, s.position, s.salary
      from raw.dk_salaries s
      where s.site = ${site} and s.slate_id = ${sid}
        and s.player_id is not null and s.roster_position != 'CPT'
      order by s.player_id, (s.roster_position = 'FLEX') asc`,
    sql()`
      select distinct on (n.player_id)
             n.player_id, n.title
      from raw.fantasypros_news n
      where n.player_id is not null and n.title is not null
      order by n.player_id, coalesce(n.created_at, n.first_seen_at) desc`,
  ]);

  const runId = runRows[0]?.run_id ? String(runRows[0].run_id) : null;

  const [projRows, luRows] = runId
    ? await Promise.all([
        sql()`
          select pp.player_id, pp.fpts_dk_mean::float8 as proj_dk_mean
          from model.proj_players pp
          where pp.run_id = ${runId}::uuid`,
        sql()`
          select l.lineup_id, l.salary_used,
                 l.proj_fpts::float8 as proj_fpts,
                 l.sim_win_pct::float8 as sim_win_pct,
                 l.sim_roi::float8 as sim_roi,
                 l.lineup
          from model.dfs_lineups l
          where l.run_id = ${runId}::uuid and l.site = ${site} and l.slate_id = ${sid}
          order by l.sim_win_pct desc nulls last, l.proj_fpts desc nulls last, l.lineup_id
          limit 50`,
      ])
    : [[], []];

  const byPlayerJudgments: Record<string, Record<string, RawJudgment>> = {};
  let auditedAt: string | null = null;
  let modelResolved: string | null = null;

  for (const r of jRows) {
    const pid = String(r.player_id);
    const qid = String(r.question_id);
    const kind = String(r.kind) as RawJudgment["kind"];
    (byPlayerJudgments[pid] ??= {})[qid] = {
      kind,
      value: r.value != null ? Number(r.value) : null,
      confidence: r.confidence != null ? Number(r.confidence) : null,
    };
    const stamp = r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at ? String(r.created_at) : null;
    if (stamp && (!auditedAt || stamp > auditedAt)) auditedAt = stamp;
    if (r.model_resolved && kind !== "no_read") modelResolved = String(r.model_resolved);
  }

  const headlines: Record<string, string> = {};
  for (const r of newsRows) {
    if (r.player_id && r.title) headlines[String(r.player_id)] = String(r.title);
  }

  const projByPid: Record<string, number> = {};
  for (const r of projRows) {
    if (r.player_id && r.proj_dk_mean != null) {
      projByPid[String(r.player_id)] = Number(r.proj_dk_mean);
    }
  }

  const dkToPid: Record<string, string> = {};
  const poolByPid: Record<string, PoolPlayer> = {};

  for (const r of salRows) {
    const pid = String(r.player_id);
    if (r.player_dk_id) dkToPid[String(r.player_dk_id)] = pid;
    const evalRes = evaluatePlayerVerdict(byPlayerJudgments[pid] ?? {});
    poolByPid[pid] = {
      playerId: pid,
      name: String(r.name ?? pid),
      team: String(r.team ?? ""),
      position: String(r.position ?? ""),
      salary: Number(r.salary ?? 0),
      projDkMean: projByPid[pid] ?? null,
      verdict: evalRes.verdict,
      reasons: evalRes.reasons,
      boost: evalRes.boostSignal,
      headline: headlines[pid] ?? null,
    };
  }

  for (const [pid, jMap] of Object.entries(byPlayerJudgments)) {
    if (poolByPid[pid]) continue;
    const evalRes = evaluatePlayerVerdict(jMap);
    poolByPid[pid] = {
      playerId: pid,
      name: pid,
      team: "",
      position: "",
      salary: 0,
      projDkMean: projByPid[pid] ?? null,
      verdict: evalRes.verdict,
      reasons: evalRes.reasons,
      boost: evalRes.boostSignal,
      headline: headlines[pid] ?? null,
    };
  }

  const lineups: AuditedLineup[] = luRows.map((r) => {
    const lu = (r.lineup ?? {}) as { players?: unknown[] };
    const rawPlayers = Array.isArray(lu.players) ? lu.players : [];
    return composeLineupAudit(
      {
        lineupId: String(r.lineup_id),
        salaryUsed: r.salary_used != null ? Number(r.salary_used) : null,
        projFpts: r.proj_fpts != null ? Number(r.proj_fpts) : null,
        simWinPct: r.sim_win_pct != null ? Number(r.sim_win_pct) : null,
        simRoi: r.sim_roi != null ? Number(r.sim_roi) : null,
        players: rawPlayers.map((p) => {
          const item = (p ?? {}) as Record<string, unknown>;
          return {
            slot: String(item.slot ?? ""),
            player_id: item.player_id != null ? String(item.player_id) : null,
            dk_id: item.dk_id != null ? String(item.dk_id) : null,
            name: String(item.name ?? ""),
            team: item.team != null ? String(item.team) : null,
            position: item.position != null ? String(item.position) : null,
            salary: Number(item.salary ?? 0),
            proj_fpts: item.proj_fpts != null ? Number(item.proj_fpts) : null,
          };
        }),
      },
      poolByPid,
      dkToPid,
    );
  });

  return {
    slate,
    slateId: sid,
    runId,
    auditedAt,
    modelResolved,
    auditedPlayerCount: Object.keys(byPlayerJudgments).length,
    poolByPid,
    lineups,
  };
}
