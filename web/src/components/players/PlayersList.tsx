"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PositionPill } from "@/components/ui/PositionPill";
import type { WeekPlayer } from "@/lib/types";

const COLS = ["Player", "Team", "DK pts", "Typical game"] as const;

/** Search → prop detail. Rows from model.proj_players. */
export function PlayersList({ players = [] }: { players?: WeekPlayer[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return players;
    return players.filter(
      (p) =>
        p.display_name.toLowerCase().includes(needle) ||
        (p.team ?? "").toLowerCase().includes(needle) ||
        (p.position ?? "").toLowerCase().includes(needle),
    );
  }, [players, q]);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-3">
        <h1 className="t-title">Players</h1>
        <label className="flex max-w-sm flex-col gap-1">
          <span className="t-colhead text-muted-foreground">Search</span>
          <Input
            placeholder="Name or team"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-describedby="players-search-help"
          />
          <span id="players-search-help" className="t-caption">
            Filter this week’s projections. A row opens prop detail.
          </span>
        </label>
      </header>
      <section className="card overflow-x-auto" aria-label="Players">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow className="hover:bg-transparent">
              {COLS.map((c) => (
                <TableHead key={c} className="t-colhead text-muted-foreground">
                  {c}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLS.length} className="py-6 text-center t-caption">
                  No projections listed yet
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((p) => (
                <TableRow key={p.player_id}>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      <PositionPill position={p.position} />
                      <Link
                        href={`/props/${p.game_id ?? "unknown"}/${p.player_id}`}
                        className="font-semibold text-foreground underline-offset-2 hover:underline"
                      >
                        {p.display_name}
                      </Link>
                    </span>
                  </TableCell>
                  <TableCell className="t-body font-semibold text-foreground">{p.team ?? "—"}</TableCell>
                  <TableCell className="tnum font-semibold text-foreground">
                    {p.fpts_dk_mean != null ? p.fpts_dk_mean.toFixed(1) : "—"}
                  </TableCell>
                  <TableCell className="tnum font-semibold text-foreground">
                    {p.typical_dk != null ? p.typical_dk.toFixed(1) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
