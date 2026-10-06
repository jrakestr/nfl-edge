"use client";

import { useEffect, useState } from "react";

/** Cached Gemini sentences. Input rows live on GameWhy; this only fetches when the drawer is open. */
export function WhyExplain({
  runId,
  gameId,
  open,
}: {
  runId: string | null | undefined;
  gameId: string | null | undefined;
  open: boolean;
}) {
  const key = `${runId ?? ""}:${gameId ?? ""}`;
  const [seen, setSeen] = useState(key);
  const [sentences, setSentences] = useState<string[]>([]);
  const [caption, setCaption] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (seen !== key) {
    setSeen(key);
    setSentences([]);
    setCaption(null);
    setError(null);
  }

  useEffect(() => {
    if (!open || !runId || !gameId) return;
    let cancel = false;
    fetch(`/api/explain?run_id=${encodeURIComponent(runId)}&game_id=${encodeURIComponent(gameId)}`)
      .then(async (r) => {
        const body = (await r.json()) as {
          sentences?: string[];
          driver?: string;
          evidence_strength?: string;
          error?: string;
        };
        if (cancel) return;
        setSentences(Array.isArray(body.sentences) ? body.sentences : []);
        const strength = typeof body.evidence_strength === "string" ? body.evidence_strength : "";
        const driver = typeof body.driver === "string" ? body.driver : "";
        setCaption(strength && driver ? `${strength} evidence · ${driver}` : null);
        setError(body.error ?? null);
      })
      .catch(() => {
        if (!cancel) setError("Explain failed");
      });
    return () => {
      cancel = true;
    };
  }, [open, runId, gameId]);

  if (!open) return null;

  return (
    <section aria-label="Why the number" className="flex flex-col gap-2">
      <h4 className="t-colhead text-muted-foreground">Why the number</h4>
      {sentences.length === 0 && !error ? <p className="t-body text-muted-foreground">Explaining…</p> : null}
      {sentences.map((s, i) => (
        <p key={i} className="t-sentence">
          {s}
        </p>
      ))}
      {caption ? <p className="t-caption text-muted-foreground">{caption}</p> : null}
      {error ? <p className="t-caption text-warn">{error}</p> : null}
    </section>
  );
}
