"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { triggerPhase, unlockWorkflow, uploadSalaryFile } from "@/lib/actions/workflow";
import { shortStampLocal } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  PHASES,
  anyRunning,
  canRunFrom,
  formatDuration,
  latestByKey,
  type PhaseKey,
  type WorkflowRun,
} from "@/lib/workflow";
import type { ChangeCheck } from "@/lib/queries/workflow";

type Props = {
  unlocked: boolean;
  season: number;
  week: number;
  runs: WorkflowRun[];
  slates: string[];
  changeCheck: ChangeCheck | null;
};

type Notice = { ok: boolean; text: string } | null;

const STATUS_LABEL = { running: "Running", success: "Done", failed: "Failed" } as const;

function StatusText({ run }: { run: WorkflowRun | undefined }) {
  if (!run) return <span className="text-muted-foreground">Not run this week</span>;
  return (
    <span
      className={cn(
        "font-semibold",
        run.status === "running" && "text-warn",
        run.status === "failed" && "text-destructive",
      )}
    >
      {STATUS_LABEL[run.status]}
    </span>
  );
}

function RunMeta({ run, now }: { run: WorkflowRun | undefined; now: Date }) {
  if (!run) return null;
  return (
    <span className="flex flex-wrap gap-x-3 t-caption text-muted-foreground tnum">
      <span>{shortStampLocal(run.started_at)}</span>
      <span>{formatDuration(run.started_at, run.finished_at, now)}</span>
      {run.host ? <span>{run.host === "github" ? "GitHub" : "Mac"}</span> : null}
      {run.gh_run_url ? (
        <a className="underline" href={run.gh_run_url} target="_blank" rel="noreferrer">
          Log
        </a>
      ) : null}
    </span>
  );
}

function Unlock({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex max-w-sm flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await unlockWorkflow(password);
          if (r.ok) onDone();
          else setError(r.error);
        });
      }}
    >
      <label className="t-body font-semibold" htmlFor="wf-password">
        Workflow password
      </label>
      <Input
        id="wf-password"
        type="password"
        autoComplete="current-password"
        className="h-9 t-body"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      <Button type="submit" className="h-9 t-body" disabled={pending || !password}>
        Unlock
      </Button>
      {error ? <p className="t-caption text-destructive">{error}</p> : null}
    </form>
  );
}

export function WorkflowPage({ unlocked, season, week, runs, slates, changeCheck }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<Notice>(null);
  const [draws, setDraws] = useState("");
  const [fieldSize, setFieldSize] = useState("");
  const [iterations, setIterations] = useState("");
  const [pollUntil, setPollUntil] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const latest = latestByKey(runs);
  const running = anyRunning(runs);

  // Poll while something runs, and for 3 minutes after a button press (runner start-up).
  useEffect(() => {
    if (!running && Date.now() > pollUntil) return;
    const id = setInterval(() => {
      setNow(new Date());
      router.refresh();
    }, 10_000);
    return () => clearInterval(id);
  }, [running, pollUntil, router]);

  if (!unlocked) {
    return (
      <div className="flex flex-col gap-4">
        <header>
          <h1 className="t-title">Workflow</h1>
          <p className="mt-1 t-caption">Run the week&apos;s phases on GitHub. Enter the password to see the buttons.</p>
        </header>
        <Unlock onDone={() => router.refresh()} />
      </div>
    );
  }

  function run(phase: PhaseKey, opts: { runFrom?: boolean; slate?: string } = {}) {
    setNotice(null);
    start(async () => {
      const r = await triggerPhase({ phase, week, draws, fieldSize, iterations, ...opts });
      setNotice(r.ok ? { ok: true, text: r.message } : { ok: false, text: r.error });
      if (r.ok) setPollUntil(Date.now() + 3 * 60_000);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="t-title">Workflow</h1>
        <p className="mt-1 t-caption">
          {season} week {week}. Each button starts a GitHub run; one pipeline runs at a time. Refresh also runs on
          its own Thu–Mon at 9, 12, 3 and 6 Phoenix time, and that run pulls LOC standings.
        </p>
      </header>

      {notice ? (
        <p role="status" className={cn("t-body", notice.ok ? "text-foreground" : "text-destructive")}>
          {notice.text}
        </p>
      ) : null}

      {changeCheck ? (
        <section className="flex flex-col gap-1" aria-label="Change check">
          <h2 className="t-body font-semibold">
            Since the last sim: {changeCheck.suggest_resim ? "re-sim suggested" : "no re-sim needed"}
          </h2>
          <p className="t-caption text-muted-foreground">
            Checked {shortStampLocal(changeCheck.checked_at)}. {changeCheck.reasons.length} status changes,{" "}
            {changeCheck.n_info} line moves.
          </p>
          {changeCheck.reasons.length ? (
            <ul className="t-caption flex flex-col gap-0.5">
              {changeCheck.reasons.slice(0, 12).map((r, i) => (
                <li key={i}>
                  {r.player} {r.team ? `(${r.team})` : ""}: {r.before ?? "—"} → {r.after ?? "—"}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <section className="flex flex-col gap-2" aria-label="Phases">
        <h2 className="t-body font-semibold">Phases</h2>
        <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {PHASES.map((p) => {
            const last = latest.get(p.key);
            return (
              <li key={p.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
                <div className="flex min-w-48 flex-1 flex-col">
                  <span className="t-body font-semibold">{p.label}</span>
                  <span className="t-caption text-muted-foreground">{p.detail}</span>
                </div>
                <div className="flex min-w-56 flex-col">
                  <span className="t-body">
                    <StatusText run={last} />
                  </span>
                  <RunMeta run={last} now={now} />
                  {last?.status === "failed" && last.message ? (
                    <span className="t-caption text-destructive">{last.message}</span>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button className="h-9 t-body" disabled={pending} onClick={() => run(p.key)}>
                    {p.key === "dfs" ? "Run all slates" : "Run"}
                  </Button>
                  {canRunFrom(p.key) && p.key !== "dfs" ? (
                    <Button
                      variant="outline"
                      className="h-9 t-body"
                      disabled={pending}
                      onClick={() => run(p.key, { runFrom: true })}
                    >
                      Run from here
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="flex flex-col gap-2" aria-label="DFS slates">
        <h2 className="t-body font-semibold">DFS by slate</h2>
        {slates.length === 0 ? (
          <p className="t-caption text-muted-foreground">No salary files for week {week} yet. Upload them below.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {slates.map((s) => {
              const last = latest.get(`dfs:${s}`);
              return (
                <li key={s} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5">
                  <span className="min-w-32 t-body font-semibold">{s}</span>
                  <div className="flex min-w-56 flex-1 flex-col">
                    <span className="t-body">
                      <StatusText run={last} />
                    </span>
                    <RunMeta run={last} now={now} />
                  </div>
                  <Button className="h-9 t-body" disabled={pending} onClick={() => run("dfs", { slate: s })}>
                    Run
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2" aria-label="Settings">
        <h2 className="t-body font-semibold">Settings for the next run</h2>
        <p className="t-caption text-muted-foreground">Blank uses config/sim.yaml.</p>
        <div className="flex flex-wrap gap-3">
          {(
            [
              ["Sim draws per game", draws, setDraws],
              ["DFS field size", fieldSize, setFieldSize],
              ["DFS iterations", iterations, setIterations],
            ] as const
          ).map(([label, value, set]) => (
            <label key={label} className="flex flex-col gap-1 t-caption">
              {label}
              <Input
                inputMode="numeric"
                className="h-9 w-40 t-body tnum"
                value={value}
                onChange={(e) => set(e.target.value)}
              />
            </label>
          ))}
        </div>
      </section>

      <SalaryUpload week={week} onSaved={(text) => setNotice({ ok: true, text })} onError={(text) => setNotice({ ok: false, text })} />
    </div>
  );
}

function SalaryUpload({
  week,
  onSaved,
  onError,
}: {
  week: number;
  onSaved: (text: string) => void;
  onError: (text: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <section className="flex flex-col gap-2" aria-label="Salary files">
      <h2 className="t-body font-semibold">Upload a DK salary file</h2>
      <p className="t-caption text-muted-foreground">
        One CSV per slate, straight from DraftKings. Uploading the same slate again replaces it. Then run Salaries.
      </p>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          form.set("week", String(week));
          const el = e.currentTarget;
          start(async () => {
            const r = await uploadSalaryFile(form);
            if (r.ok) {
              onSaved(r.message);
              el.reset();
              router.refresh();
            } else onError(r.error);
          });
        }}
      >
        <label className="flex flex-col gap-1 t-caption">
          Slate
          <Input name="slate" required placeholder="main" className="h-9 w-40 t-body" />
        </label>
        <label className="flex flex-col gap-1 t-caption">
          CSV
          <Input name="file" type="file" accept=".csv,text/csv" required className="h-9 t-body" />
        </label>
        <Button type="submit" className="h-9 t-body" disabled={pending}>
          Upload
        </Button>
      </form>
    </section>
  );
}
