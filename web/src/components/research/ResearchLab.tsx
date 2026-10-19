"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PositionPill } from "@/components/ui/PositionPill";
import { Button } from "@/components/ui/button";
import { DataTable, type DataColumn } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/input";
import { deleteResearchMetric, saveResearchMetric } from "@/lib/actions/research-metrics";
import { estimateJevRun, runJev, type JevPlan } from "@/lib/actions/research-jev";
import { normalizeLabel, scoreText, termsText } from "@/lib/research/display";
import { fieldLabel } from "@/lib/research/fields";
import type { RubricStatus } from "@/lib/research/jev";
import type { Metric, Normalize, ScoredPlayer } from "@/lib/research/score";

type Draft = { field: string; weight: string };

const SELECT = "h-8 rounded-md border border-border bg-card px-2 t-body";

/** Jev cell text. A cached score shows as a number; otherwise the status. Never blank, never guessed. */
export function jevCellText(status: RubricStatus, value?: number | null): string {
  if (value != null) return value.toFixed(2);
  return status.configured ? "Not run" : "Not configured";
}

const MAX_LIMIT = 100;

function JevPanel({ week, metrics, jev }: { week: number; metrics: Metric[]; jev: RubricStatus }) {
  const [metricId, setMetricId] = useState(metrics[0]?.id ?? "");
  const [limit, setLimit] = useState("25");
  const [plan, setPlan] = useState<JevPlan | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = Number(limit);
  const input = { week, metricId, limit: n };

  function reset() {
    setPlan(null);
    setMessage(null);
    setError(null);
  }
  function estimate() {
    reset();
    start(async () => {
      const res = await estimateJevRun(input);
      if (res.ok) setPlan(res);
      else setError(res.error);
    });
  }
  function run() {
    setMessage(null);
    setError(null);
    start(async () => {
      const res = await runJev(input);
      if (res.ok) {
        setPlan(null);
        setMessage(res.toCall === 0 ? "All players already cached. No call made." : `Scored ${res.written} players.`);
      } else setError(res.error);
    });
  }

  if (!jev.configured) {
    return <p className="t-caption text-muted-foreground">Jev rubric: not configured ({jev.reason}).</p>;
  }
  if (metrics.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="t-sentence font-semibold">Jev rubric</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="t-colhead text-muted-foreground">Metric</span>
          <select
            className={`${SELECT} w-56`}
            value={metricId}
            onChange={(e) => {
              setMetricId(e.target.value);
              reset();
            }}
          >
            {metrics.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex w-24 flex-col gap-1">
          <span className="t-colhead text-muted-foreground">Top players</span>
          <Input
            inputMode="numeric"
            value={limit}
            onChange={(e) => {
              setLimit(e.target.value);
              reset();
            }}
          />
        </label>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={estimate}>
          Estimate cost
        </Button>
        <Button type="button" size="sm" disabled={pending || !plan || plan.toCall === 0} onClick={run}>
          {pending ? "Working" : "Run Jev"}
        </Button>
      </div>
      {plan ? (
        <p className="t-caption text-muted-foreground" role="status">
          {plan.players} players ({plan.cached} cached, {plan.toCall} to score). About {plan.tokens.toLocaleString()}{" "}
          input tokens, ${plan.usd.toFixed(4)}. Runs over $0.50 are refused.
        </p>
      ) : null}
      {message ? (
        <p className="t-caption text-muted-foreground" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="t-caption text-edge-neg">
          {error}
        </p>
      ) : null}
      <p className="t-caption text-muted-foreground">
        Top players by this metric, 1 to {MAX_LIMIT}. Jev scores are display only (0 to 4 per field, weighted by your
        weights) and cached by metric, week and model, so reruns are free.
      </p>
    </div>
  );
}

function MetricEditor({ fields }: { fields: string[] }) {
  const [name, setName] = useState("");
  const [normalize, setNormalize] = useState<Normalize>("zscore");
  const [terms, setTerms] = useState<Draft[]>([{ field: fields[0] ?? "", weight: "1" }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setError(null);
    const parsed = terms.map((t) => ({ field: t.field, weight: t.weight.trim() === "" ? NaN : Number(t.weight) }));
    start(async () => {
      const res = await saveResearchMetric({ name, normalize, terms: parsed });
      if (!res.ok) setError(res.error);
      else {
        setName("");
        setTerms([{ field: fields[0] ?? "", weight: "1" }]);
      }
    });
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h3 className="t-sentence font-semibold">New metric</h3>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex w-56 flex-col gap-1">
          <span className="t-colhead text-muted-foreground">Name</span>
          <Input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Volume score" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="t-colhead text-muted-foreground">Scale</span>
          <select className={SELECT} value={normalize} onChange={(e) => setNormalize(e.target.value as Normalize)}>
            <option value="zscore">{normalizeLabel("zscore")}</option>
            <option value="none">{normalizeLabel("none")}</option>
          </select>
        </label>
      </div>
      <div className="flex flex-col gap-2">
        {terms.map((t, i) => (
          <div key={i} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1">
              <span className="t-colhead text-muted-foreground">Field</span>
              <select
                className={`${SELECT} w-72`}
                value={t.field}
                onChange={(e) => setTerms(terms.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}
              >
                {fields.map((f) => (
                  <option key={f} value={f}>
                    {fieldLabel(f)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex w-24 flex-col gap-1">
              <span className="t-colhead text-muted-foreground">Weight</span>
              <Input
                inputMode="decimal"
                value={t.weight}
                onChange={(e) => setTerms(terms.map((x, j) => (j === i ? { ...x, weight: e.target.value } : x)))}
              />
            </label>
            {terms.length > 1 ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Remove ${fieldLabel(t.field)}`}
                onClick={() => setTerms(terms.filter((_, j) => j !== i))}
              >
                <Trash2 size={14} strokeWidth={1.5} aria-hidden />
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setTerms([...terms, { field: fields[0] ?? "", weight: "1" }])}
        >
          <Plus size={14} strokeWidth={1.5} aria-hidden />
          Add field
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving" : "Save metric"}
        </Button>
        {error ? (
          <span role="alert" className="t-caption text-edge-neg">
            {error}
          </span>
        ) : null}
      </div>
      <p className="t-caption text-muted-foreground">
        A player missing any field in a metric gets no score for it. Nothing is filled in. Z-score puts every field
        on one scale so weights are comparable.
      </p>
    </form>
  );
}

function MetricList({ metrics, errors }: { metrics: Metric[]; errors: Record<string, string[]> }) {
  const [pending, start] = useTransition();
  if (metrics.length === 0) {
    return <p className="t-sentence text-muted-foreground">No metrics yet. Add one below to score players.</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-border-soft">
      {metrics.map((m) => (
        <li key={m.id} className="flex flex-wrap items-center gap-3 py-2">
          <span className="t-body min-w-40 font-semibold">{m.name}</span>
          <span className="t-caption min-w-0 flex-1 text-muted-foreground">
            {termsText(m)}. {normalizeLabel(m.normalize)}.
          </span>
          {errors[m.id] ? (
            <span role="alert" className="t-caption text-edge-neg">
              Not scored: {errors[m.id]!.join(" ")}
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={pending}
            aria-label={`Delete ${m.name}`}
            onClick={() => start(async () => void (await deleteResearchMetric(Number(m.id))))}
          >
            <Trash2 size={14} strokeWidth={1.5} aria-hidden />
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function ResearchLab({
  rows,
  metrics,
  metricErrors,
  fields,
  jev,
  week,
  jevScores,
}: {
  rows: ScoredPlayer[];
  metrics: Metric[];
  metricErrors: Record<string, string[]>;
  fields: string[];
  jev: RubricStatus;
  week: number;
  /** Metric id → player id → cached Jev score. */
  jevScores: Record<string, Record<string, number>>;
}) {
  const scored = metrics.filter((m) => !metricErrors[m.id]);
  const columns: DataColumn<ScoredPlayer>[] = [
    {
      id: "player",
      header: "Player",
      sortValue: (r) => r.name,
      cell: (r) => (
        <span className="flex items-center gap-2">
          <PositionPill position={r.position} />
          <span className="t-body font-semibold text-foreground">{r.name}</span>
        </span>
      ),
    },
    { id: "team", header: "Team", sortValue: (r) => r.team, cell: (r) => <span className="t-body">{r.team}</span> },
    ...scored.map<DataColumn<ScoredPlayer>>((m) => ({
      id: `m${m.id}`,
      header: m.name,
      align: "right",
      sortValue: (r) => r.scores[m.id]?.value ?? null,
      cell: (r) => {
        const s = r.scores[m.id];
        if (!s || s.value == null) {
          return (
            <span className="t-body tnum" title={s?.missing.length ? `Missing: ${s.missing.join(", ")}` : undefined}>
              —
            </span>
          );
        }
        return (
          <span className="t-body tnum">
            {scoreText(s.value)} <span className="t-caption text-muted-foreground">#{s.positionRank} {r.position}</span>
          </span>
        );
      },
    })),
    ...(scored.length
      ? scored.map<DataColumn<ScoredPlayer>>((m) => ({
          id: `jev${m.id}`,
          header: `Jev: ${m.name}`,
          align: "right",
          sortValue: (r) => jevScores[m.id]?.[r.playerId] ?? null,
          cell: (r) => (
            <span className="t-caption tnum text-muted-foreground">
              {jevCellText(jev, jevScores[m.id]?.[r.playerId])}
            </span>
          ),
        }))
      : [
          {
            id: "jev",
            header: "Jev rubric",
            sortable: false,
            cell: () => <span className="t-caption text-muted-foreground">{jevCellText(jev)}</span>,
          } satisfies DataColumn<ScoredPlayer>,
        ]),
  ];

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col gap-4 p-4" aria-label="Metrics">
        <h2 className="t-title">Metrics</h2>
        <MetricList metrics={metrics} errors={metricErrors} />
        <MetricEditor fields={fields} />
        <JevPanel week={week} metrics={scored} jev={jev} />
      </section>
      <DataTable
        data={rows}
        columns={columns}
        getRowId={(r) => r.playerId}
        empty="No players."
        ariaLabel="Scored players"
        defaultSort={scored[0] ? { id: `m${scored[0].id}`, dir: "desc" } : { id: "player", dir: "asc" }}
        searchPlaceholder="Search players"
        filters={{
          search: (r, q) => r.name.toLowerCase().includes(q),
          position: (r) => r.position,
          team: (r) => r.team,
        }}
      />
    </div>
  );
}
