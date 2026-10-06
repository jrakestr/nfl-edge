"use client";

import { useState } from "react";
import { promoteClaim } from "@/lib/actions/promote-claim";
import type { StagedClaim } from "@/lib/queries/claims";
import { Button } from "@/components/ui/button";

export function ClaimsPanel({
  season,
  week,
  rows,
}: {
  season: number;
  week: number;
  rows: StagedClaim[];
}) {
  const [text, setText] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rejected, setRejected] = useState<{ player: string; team: string; reason: string }[]>([]);

  async function stage() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source_url: sourceUrl || undefined, season, week }),
      });
      const body = (await res.json()) as {
        error?: string;
        rejected?: { player: string; team: string; reason: string }[];
      };
      if (body.error) setError(body.error);
      setRejected(body.rejected ?? []);
      if (!body.error) window.location.reload();
    } catch {
      setError("Claims failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card p-4" aria-label="Paste a report">
        <p className="t-caption mb-2">
          Paste report text. The URL field is metadata only — the server does not fetch it.
        </p>
        <textarea
          className="min-h-32 w-full rounded-md border bg-background p-2 t-body"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Injury report or beat note"
        />
        <input
          className="mt-2 w-full rounded-md border bg-background p-2 t-body"
          value={sourceUrl}
          onChange={(e) => setSourceUrl(e.target.value)}
          placeholder="Source URL (optional, not fetched)"
        />
        <Button type="button" className="mt-3" disabled={busy || !text.trim()} onClick={stage}>
          {busy ? "Staging…" : "Stage claims"}
        </Button>
        {error ? <p className="mt-2 t-body text-warn">{error}</p> : null}
        {rejected.length ? (
          <ul className="mt-2 t-caption text-warn">
            {rejected.map((r) => (
              <li key={`${r.player}-${r.team}`}>
                {r.player} {r.team} — {r.reason}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section aria-label="Staged vs overrides">
        <h2 className="t-colhead mb-2 text-muted-foreground">Staged rows vs current overrides</h2>
        {rows.length === 0 ? (
          <p className="t-body text-muted-foreground">No staged claims this week.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.id} className="card p-3">
                <p className="t-body font-semibold">
                  {r.player_name} {r.team} · {r.status} · {r.channel} × {r.usage_multiplier}
                </p>
                <p className="t-caption">
                  Before: {r.override_status ?? "none"}
                  {r.override_multiplier != null ? ` × ${r.override_multiplier}` : ""}
                  {" → "}
                  After: {r.status} × {r.usage_multiplier}
                </p>
                {r.quote ? <p className="t-caption mt-1">“{r.quote}”</p> : null}
                <PromoteButton id={r.id} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function PromoteButton({ id }: { id: number }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mt-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={async () => {
          const r = await promoteClaim(id);
          if (!r.ok) setErr(r.error);
        }}
      >
        Promote one row
      </Button>
      {err ? <p className="t-caption text-warn">{err}</p> : null}
    </div>
  );
}
