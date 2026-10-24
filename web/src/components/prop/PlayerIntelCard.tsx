"use client";

import { useMemo, useState } from "react";
import { Sparkles, Swords } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeDetailHolistic, type HolisticTier } from "@/lib/holistic-score";
import { signed } from "@/lib/edge";
import type { PeerOption } from "@/lib/queries/players";
import type { Hist, PlayerNewsItem } from "@/lib/types";
import type { DefenseVsPosition, PlayerUsage } from "@/lib/usage";
import { cn } from "@/lib/utils";
import type { PlayerIntelSummary } from "@/app/api/player-intel/route";

type SingleSynthesis = {
  headline: string;
  primary_driver: string;
  news_impact: string;
  bullets: string[];
};

type CompareSynthesis = {
  recommended_player_id: string;
  recommended_name: string;
  recommendation_mode: "SAFE_FLOOR" | "GPP_CEILING" | "ALL_PURPOSE_EDGE";
  headline: string;
  bullets: string[];
};

function tierBadgeClass(tier: HolisticTier): string {
  switch (tier) {
    case "ELITE":
      return "bg-edge-pos-tint text-edge-pos border-edge-pos/30";
    case "STRONG":
      return "bg-line-tint text-line border-line/30";
    case "FLEX":
      return "bg-surface-inset text-foreground border-border-soft";
    case "FADE":
      return "bg-edge-neg-tint text-edge-neg border-edge-neg/30";
  }
}

function barTone(score: number): string {
  if (score >= 72) return "bg-edge-pos";
  if (score >= 52) return "bg-line";
  if (score >= 38) return "bg-warn";
  return "bg-edge-neg";
}

function SubscoreBar({ label, score }: { label: string; score: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2 t-caption">
        <span className="text-muted-foreground">{label}</span>
        <span className="tnum font-bold text-foreground">{score}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-surface-inset">
        <div
          className={cn("h-full rounded-full transition-all", barTone(score))}
          style={{ width: `${Math.max(4, Math.min(100, score))}%` }}
        />
      </div>
    </div>
  );
}

export function PlayerIntelCard({
  playerId,
  position,
  gameId,
  season,
  week,
  fptsHist,
  usage,
  defense,
  news,
  peers = [],
}: {
  playerId: string;
  position: string | null;
  gameId: string | null;
  season: number;
  week: number;
  fptsHist: Hist | null;
  usage: PlayerUsage | null;
  defense: DefenseVsPosition | null;
  news: PlayerNewsItem[];
  peers?: PeerOption[];
}) {
  const holistic = useMemo(
    () =>
      computeDetailHolistic({
        position,
        fptsHist,
        usage,
        defense,
        news,
      }),
    [position, fptsHist, usage, defense, news],
  );

  const [compareId, setCompareId] = useState<string>("none");
  const [loading, setLoading] = useState(false);
  const [singleResult, setSingleResult] = useState<SingleSynthesis | null>(null);
  const [compareResult, setCompareResult] = useState<{
    playerA: PlayerIntelSummary;
    playerB: PlayerIntelSummary;
    synthesis: CompareSynthesis;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runSingleBrief() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        player_id: playerId,
        season: String(season),
        week: String(week),
      });
      if (gameId) qs.set("game_id", gameId);
      const res = await fetch(`/api/player-intel?${qs.toString()}`);
      const json = (await res.json()) as {
        error?: string;
        synthesis?: SingleSynthesis;
      };
      if (json.error || !json.synthesis) {
        setError(json.error ?? "Unable to generate brief");
      } else {
        setSingleResult(json.synthesis);
      }
    } catch {
      setError("Network error while generating brief");
    } finally {
      setLoading(false);
    }
  }

  async function runHeadToHead(targetPeerId: string) {
    if (!targetPeerId || targetPeerId === "none") return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        player_id: playerId,
        compare_id: targetPeerId,
        season: String(season),
        week: String(week),
      });
      if (gameId) qs.set("game_id", gameId);
      const res = await fetch(`/api/player-intel?${qs.toString()}`);
      const json = (await res.json()) as {
        error?: string;
        playerA?: PlayerIntelSummary;
        playerB?: PlayerIntelSummary;
        synthesis?: CompareSynthesis;
      };
      if (json.error || !json.synthesis || !json.playerA || !json.playerB) {
        setError(json.error ?? "Unable to compare players");
      } else {
        setCompareResult({
          playerA: json.playerA,
          playerB: json.playerB,
          synthesis: json.synthesis,
        });
      }
    } catch {
      setError("Network error while comparing players");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section
      className="card flex flex-col gap-4 p-4"
      data-slot="player-intel-card"
      aria-label="Holistic player ranking and AI start-sit advisor"
    >
      {/* Top Row: Holistic Composite Score + Subscores + Actions */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-center">
        {/* Left: Holistic Composite Badge (4 cols) */}
        <div className="flex items-center gap-3.5 rounded-lg border border-border-soft bg-surface-inset p-3 lg:col-span-4">
          <div
            className={cn(
              "flex size-14 shrink-0 flex-col items-center justify-center rounded-lg border font-bold tnum",
              tierBadgeClass(holistic.tier),
            )}
            aria-label={`Holistic rating ${holistic.score} out of 99`}
          >
            <span className="t-stat leading-none">{holistic.score}</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="t-body font-semibold text-foreground">Holistic Rating</h2>
              <span
                className={cn(
                  "rounded border px-2 py-0.5 t-caption font-bold",
                  tierBadgeClass(holistic.tier),
                )}
              >
                {holistic.tier}
              </span>
            </div>
            <p className="mt-1 t-caption text-muted-foreground">
              Sim distribution · usage role · matchup · news signal ({signed(holistic.subscores.newsDelta, 0)} pts)
            </p>
          </div>
        </div>

        {/* Middle: 4 Pillar Subscores (5 cols) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-5">
          <SubscoreBar label="Sim Ceiling" score={holistic.subscores.projection} />
          <SubscoreBar label="Usage & Role" score={holistic.subscores.usage} />
          <SubscoreBar label="Def Matchup" score={holistic.subscores.matchup} />
          <SubscoreBar label="Floor / Value" score={holistic.subscores.value} />
        </div>

        {/* Right: AI Synthesis & Start/Sit Trigger (3 cols) */}
        <div className="flex flex-col gap-2 lg:col-span-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={runSingleBrief}
            className="w-full justify-center gap-1.5"
          >
            <Sparkles className="size-4" aria-hidden />
            {loading && compareId === "none" ? "Synthesizing…" : "AI Holistic Brief"}
          </Button>
          {peers.length > 0 ? (
            <div className="flex items-center gap-1.5">
              <Select
                value={compareId}
                onValueChange={(v) => {
                  setCompareId(v);
                  if (v !== "none") {
                    void runHeadToHead(v);
                  } else {
                    setCompareResult(null);
                  }
                }}
              >
                <SelectTrigger
                  aria-label="Compare start/sit vs peer"
                  className="h-8 flex-1 rounded-md t-caption"
                >
                  <SelectValue placeholder="Start/Sit vs…" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="none">Start/Sit vs {position ?? "Peer"}…</SelectItem>
                  {peers.map((p) => (
                    <SelectItem key={p.player_id} value={p.player_id}>
                      {p.display_name} ({p.team ?? "FA"} · {p.fpts_dk_mean?.toFixed(1) ?? "—"} pts)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="t-caption text-edge-neg" role="alert">
          {error}
        </p>
      ) : null}

      {/* Single-Player AI Brief Output */}
      {singleResult && !compareResult ? (
        <div
          className="rounded-lg border border-border-soft bg-surface-inset p-3.5"
          data-slot="ai-single-brief"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="t-body font-bold text-foreground">{singleResult.headline}</p>
            <span className="rounded bg-card px-2 py-0.5 t-caption font-semibold text-muted-foreground">
              Gemini Holistic Synthesis
            </span>
          </div>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 t-caption text-foreground">
            {singleResult.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Head-to-Head Start/Sit Comparison Output */}
      {compareResult ? (
        <div
          className="flex flex-col gap-3 rounded-lg border border-border-soft bg-surface-inset p-3.5"
          data-slot="ai-compare-verdict"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-soft pb-2.5">
            <div className="flex items-center gap-2">
              <Swords className="size-4 text-line" aria-hidden />
              <span className="t-body font-bold text-foreground">
                {compareResult.synthesis.headline}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-edge-pos-tint px-2 py-0.5 t-caption font-bold text-edge-pos">
                PICK: {compareResult.synthesis.recommended_name} (
                {compareResult.synthesis.recommendation_mode.replace(/_/g, " ")})
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setCompareId("none");
                  setCompareResult(null);
                }}
              >
                Close
              </Button>
            </div>
          </div>

          {/* Side-by-side metric comparison table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left t-caption">
              <thead>
                <tr className="border-b border-border-soft text-muted-foreground">
                  <th className="py-1.5 font-semibold">Metric</th>
                  <th className="py-1.5 text-right font-bold text-foreground">
                    {compareResult.playerA.name} ({compareResult.playerA.team})
                  </th>
                  <th className="py-1.5 text-right font-bold text-foreground">
                    {compareResult.playerB.name} ({compareResult.playerB.team})
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-soft/60 tnum">
                <tr>
                  <td className="py-1.5 text-muted-foreground">Holistic Rating (0–99)</td>
                  <td className="py-1.5 text-right font-bold text-foreground">
                    {compareResult.playerA.holistic.score} ({compareResult.playerA.holistic.tier})
                  </td>
                  <td className="py-1.5 text-right font-bold text-foreground">
                    {compareResult.playerB.holistic.score} ({compareResult.playerB.holistic.tier})
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 text-muted-foreground">Sim Mean / Ceiling (P90)</td>
                  <td className="py-1.5 text-right font-semibold text-foreground">
                    {compareResult.playerA.sim.mean?.toFixed(1) ?? "—"} /{" "}
                    {compareResult.playerA.sim.ceiling_p90?.toFixed(1) ?? "—"}
                  </td>
                  <td className="py-1.5 text-right font-semibold text-foreground">
                    {compareResult.playerB.sim.mean?.toFixed(1) ?? "—"} /{" "}
                    {compareResult.playerB.sim.ceiling_p90?.toFixed(1) ?? "—"}
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 text-muted-foreground">Sim Floor (P10) / Value</td>
                  <td className="py-1.5 text-right font-semibold text-foreground">
                    {compareResult.playerA.sim.floor_p10?.toFixed(1) ?? "—"} /{" "}
                    {compareResult.playerA.sim.value?.toFixed(2) ?? "—"}x
                  </td>
                  <td className="py-1.5 text-right font-semibold text-foreground">
                    {compareResult.playerB.sim.floor_p10?.toFixed(1) ?? "—"} /{" "}
                    {compareResult.playerB.sim.value?.toFixed(2) ?? "—"}x
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 text-muted-foreground">Snap % / Target Share</td>
                  <td className="py-1.5 text-right font-semibold text-foreground">
                    {compareResult.playerA.usage.snap_pct ?? "—"}% /{" "}
                    {compareResult.playerA.usage.target_share ?? "—"}%
                  </td>
                  <td className="py-1.5 text-right font-semibold text-foreground">
                    {compareResult.playerB.usage.snap_pct ?? "—"}% /{" "}
                    {compareResult.playerB.usage.target_share ?? "—"}%
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 text-muted-foreground">Opp Defense Rank vs Pos</td>
                  <td className="py-1.5 text-right font-semibold text-foreground">
                    {compareResult.playerA.defense.opponent ?? "—"} (#
                    {compareResult.playerA.defense.rank ?? "—"})
                  </td>
                  <td className="py-1.5 text-right font-semibold text-foreground">
                    {compareResult.playerB.defense.opponent ?? "—"} (#
                    {compareResult.playerB.defense.rank ?? "—"})
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <ul className="flex list-disc flex-col gap-1 pl-5 t-caption text-foreground">
            {compareResult.synthesis.bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
