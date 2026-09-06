import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { pct, signedPct } from "@/lib/edge";
import { STAT_LABELS } from "@/lib/prop-stats";
import type { PropEdge } from "@/lib/types";

const COLS = ["Player", "Game", "Market", "Line", "Chance of over", "Edge"] as const;

/** List-by-|edge|. Detail is /props/[game]/[player]. */
export function PropsIndex({ edges = [] }: { edges?: PropEdge[] }) {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="t-title">Props</h1>
        <p className="mt-1 t-caption">Sorted by |edge|. Open a player at /props/[game]/[player].</p>
      </header>
      <section className="card overflow-x-auto" aria-label="Prop edges">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow className="hover:bg-transparent">
              {COLS.map((c) => (
                <TableHead key={c} className="t-colhead text-dim">
                  {c}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {edges.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLS.length} className="py-6 text-center t-caption">
                  No prop edges yet
                </TableCell>
              </TableRow>
            ) : (
              edges.map((e) => (
                <TableRow key={`${e.player_id}-${e.stat}`}>
                  <TableCell>
                    <Link
                      href={`/props/${e.game_id ?? "unknown"}/${e.player_id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {e.player_name}
                    </Link>
                  </TableCell>
                  <TableCell className="t-caption">
                    {e.away && e.home ? `${e.away} @ ${e.home}` : e.game_id ?? "—"}
                  </TableCell>
                  <TableCell className="t-caption">{STAT_LABELS[e.stat] ?? e.stat}</TableCell>
                  <TableCell className="tnum">{e.line}</TableCell>
                  <TableCell className="tnum">{pct(e.p_over)}</TableCell>
                  <TableCell className="tnum">{signedPct(e.edge)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
