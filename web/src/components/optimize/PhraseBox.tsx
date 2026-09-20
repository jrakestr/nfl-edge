"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { FilterTokens } from "@/lib/optimize/compile-filters";
import type { OptPlayer, SolveControls } from "@/lib/optimize/types";
import { useLiveSearchParams } from "@/components/shell/GamesSelection";
import { withPickParams } from "@/lib/slate";

const SORT_LABEL: Record<string, string> = {
  value: "points per dollar",
  proj: "projection",
  salary: "salary",
  own: "ownership",
  ceiling: "ceiling",
};

export type PhraseView = { sortBy: string; sortDir: "asc" | "desc" } | null;

export function PhraseBox({
  pool,
  week,
  site,
  slate,
  lock = [],
  stack = [],
  onApply,
}: {
  pool: OptPlayer[];
  week: number | string;
  site: string;
  slate: string;
  lock?: string[];
  stack?: string[];
  onApply: (args: { patch: Partial<SolveControls>; excl: string[]; stack: string[]; questions: string[] }) => void;
}) {
  const live = useLiveSearchParams();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    tokens: FilterTokens;
    excl: string[];
    exclNames: { player_id: string; label: string }[];
    stack: string[];
    questions: string[];
    conflict: string | null;
    patch: Partial<SolveControls>;
    view: PhraseView;
  } | null>(null);

  async function parse() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/optimize-nl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, players: pool, lock, stack }),
      });
      const body = (await res.json()) as typeof preview & { error?: string };
      if (body.error) {
        setError(body.error);
        setPreview(null);
        return;
      }
      setPreview(body);
    } catch {
      setError("Parse failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-2 border-t pt-3">
      <p className="t-colhead text-muted-foreground">Phrase → inspectable lists</p>
      <textarea
        className="min-h-16 w-full rounded-md border bg-background p-2 t-body"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Five lineups, fade the Kansas City game, stack Detroit…"
      />
      <Button type="button" size="sm" disabled={busy || !text.trim()} onClick={parse}>
        {busy ? "Parsing…" : "Parse phrase"}
      </Button>
      {error ? <p className="t-body text-warn">{error}</p> : null}
      {preview?.questions.length ? (
        <ul className="t-body text-warn">
          {preview.questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      ) : null}
      {preview && !preview.questions.length ? (
        <div className="flex flex-col gap-1">
          <p className="t-body">
            {preview.patch.lineups ?? "—"} lineups
            {preview.patch.stackN ? ` · stack ${preview.tokens.stackTeam ?? ""} n=${preview.patch.stackN}` : ""}
            {preview.patch.bringBack ? ` · bring-back ${preview.patch.bringBack}` : ""}
            {` · exclude ${preview.excl.length} players`}
          </p>
          {preview.conflict ? <p className="t-body text-warn">{preview.conflict}</p> : null}
          {preview.view ? (
            <Button type="button" size="sm" variant="outline" asChild>
              <Link
                href={withPickParams(
                  `/week/${week}/players/${site}/${slate}?sort=${preview.view.sortBy}&dir=${preview.view.sortDir}`,
                  live,
                )}
              >
                Show players by {SORT_LABEL[preview.view.sortBy] ?? preview.view.sortBy}
              </Link>
            </Button>
          ) : null}
          <p className="t-caption">Exclusion list</p>
          <ul className="max-h-32 overflow-y-auto t-caption">
            {preview.exclNames.map((n) => (
              <li key={n.player_id}>{n.label}</li>
            ))}
          </ul>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() =>
              onApply({
                patch: preview.patch,
                excl: preview.excl,
                stack: preview.stack ?? [],
                questions: preview.questions,
              })
            }
          >
            Apply to controls
          </Button>
          <p className="t-caption">Does not generate. Click Generate after you confirm the lists.</p>
        </div>
      ) : null}
    </div>
  );
}
