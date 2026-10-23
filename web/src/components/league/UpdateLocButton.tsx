"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { updateLocStats } from "@/lib/actions/loc";

const POLL_MS = 15_000;
const POLL_FOR_MS = 5 * 60_000;

/** Starts a full ESPN league pull. The pull stamp moves when that run writes loc_teams.as_of. */
export function UpdateLocButton({ season, asOf }: { season: number; asOf: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const baseline = useRef<string | null>(null);
  const watching = useRef(false);

  useEffect(() => {
    if (!watching.current || asOf === baseline.current) return;
    watching.current = false;
    setNotice(null);
  }, [asOf]);

  useEffect(() => {
    if (!notice) return;
    const id = setInterval(() => router.refresh(), POLL_MS);
    const stop = setTimeout(() => {
      watching.current = false;
      setNotice(null);
    }, POLL_FOR_MS);
    return () => {
      clearInterval(id);
      clearTimeout(stop);
    };
  }, [notice, router]);

  function onClick() {
    setError(null);
    start(async () => {
      const r = await updateLocStats(season);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      baseline.current = asOf;
      watching.current = true;
      setNotice(r.message);
      router.refresh();
    });
  }

  const busy = pending || notice != null;
  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" className="h-9 t-body" disabled={busy} aria-busy={busy} onClick={onClick}>
        Update LOC stats
      </Button>
      {error || notice ? (
        <p role="status" className={error ? "t-caption text-destructive" : "t-caption"}>
          {error ?? notice}
        </p>
      ) : null}
    </div>
  );
}
