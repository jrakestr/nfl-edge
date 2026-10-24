import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { analyzeNewsSignal, computeDetailHolistic, computeRowHolisticScore } from "@/lib/holistic-score";
import { PlayerIntelCard } from "@/components/prop/PlayerIntelCard";
import type { Hist, PlayerNewsItem, WeekPlayer } from "@/lib/types";
import type { DefenseVsPosition, PlayerUsage } from "@/lib/usage";

const SAMPLE_HIST: Hist = {
  bins: [0, 10, 20, 30, 40],
  counts: [50, 250, 450, 250],
};

const SAMPLE_USAGE: PlayerUsage = {
  season: {
    window: "season",
    games: 5,
    dk_pg: 24.5,
    ppr_pg: 22.0,
    half_pg: 19.5,
    std_pg: 17.0,
    ppr_6pt_pg: 22.0,
    fp_per_target: 2.1,
    fp_per_opportunity: 1.1,
    fp_per_touch: 1.2,
    fp_per_snap: 0.48,
    fp_per_route_est: 0.9,
    fp_per_rush: 0.95,
    fp_per_dropback: null,
    fp_per_attempt: null,
    target_share: 0.21,
    snap_pct: 0.78,
    routes_pg_est: 28,
    targets_pg: 6.4,
    carries_pg: 18.2,
    yprr_est: 2.1,
    tprr_est: 0.23,
    air_yds_pg: 12,
    wopr: 0.35,
  },
  l3: {
    window: "l3",
    games: 3,
    dk_pg: 27.2,
    ppr_pg: 24.5,
    half_pg: 22.0,
    std_pg: 19.5,
    ppr_6pt_pg: 24.5,
    fp_per_target: 2.3,
    fp_per_opportunity: 1.2,
    fp_per_touch: 1.3,
    fp_per_snap: 0.52,
    fp_per_route_est: 1.0,
    fp_per_rush: 1.05,
    fp_per_dropback: null,
    fp_per_attempt: null,
    target_share: 0.22,
    snap_pct: 0.81,
    routes_pg_est: 30,
    targets_pg: 6.7,
    carries_pg: 19.0,
    yprr_est: 2.2,
    tprr_est: 0.24,
    air_yds_pg: 14,
    wopr: 0.38,
  },
  ranks: [{ metric: "dk_pg", rank: 1, of: 36 }],
  weeks: [],
};

const SAMPLE_DEFENSE: DefenseVsPosition = {
  defense: "GB",
  position: "RB",
  games: 5,
  allowed_pg: 27.3,
  league_avg: 21.9,
  rank: 2,
  of: 32,
};

const SAMPLE_NEWS: PlayerNewsItem[] = [
  {
    news_id: 1,
    player_id: "00-0039139",
    team: "DET",
    created_at: "2026-10-12 15:22 UTC",
    title: "Jahmyr Gibbs dominant in win Sunday",
    description: "Gibbs rushed 25 times for 151 yards and two touchdowns.",
    impact: "Gibbs remains a top-tier fantasy asset.",
    categories: ["Commentary"],
    author: "FP",
    link: null,
  },
];

describe("holistic-score", () => {
  it("computes ELITE tier for top usage, soft defense, and positive news", () => {
    const res = computeDetailHolistic({
      position: "RB",
      fptsHist: SAMPLE_HIST,
      usage: SAMPLE_USAGE,
      defense: SAMPLE_DEFENSE,
      news: SAMPLE_NEWS,
    });
    expect(res.score).toBeGreaterThanOrEqual(82);
    expect(res.tier).toBe("ELITE");
    expect(res.newsSignal).toBe("positive");
    expect(res.subscores.newsDelta).toBeGreaterThan(0);
  });

  it("applies negative delta when injury status or injury news is present", () => {
    const sig = analyzeNewsSignal(SAMPLE_NEWS, "out");
    expect(sig.signal).toBe("negative");
    expect(sig.delta).toBeLessThan(0);
  });

  it("computes row holistic score for PlayersList", () => {
    const p: WeekPlayer = {
      player_id: "00-0039139",
      display_name: "Jahmyr Gibbs",
      position: "RB",
      team: "DET",
      game_id: "2026_07_GB_DET",
      fpts_dk_mean: 22.4,
      typical_dk: 20.1,
      hist: null,
      opp_plus_minus: 5.4,
      market_total: 51.5,
    };
    const rowScore = computeRowHolisticScore(p, {
      projPct: 0.95,
      ceilPct: 0.98,
      floorPct: 0.88,
      valPct: 0.9,
    });
    expect(rowScore).not.toBeNull();
    expect(rowScore!.score).toBeGreaterThanOrEqual(85);
    expect(rowScore!.tier).toBe("ELITE");
  });
});

describe("PlayerIntelCard", () => {
  it("renders composite holistic badge, subscores, and fetches AI brief on click", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        mode: "single",
        synthesis: {
          headline: "Jahmyr Gibbs grades as an ELITE play against Green Bay.",
          primary_driver: "sim_ceiling",
          news_impact: "positive",
          bullets: [
            "Projects for 23.0 DK points with a 35.0 P90 ceiling.",
            "Carries a 78% snap share against the #2 softest RB defense.",
          ],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <PlayerIntelCard
        playerId="00-0039139"
        position="RB"
        gameId="2026_07_GB_DET"
        season={2026}
        week={7}
        fptsHist={SAMPLE_HIST}
        usage={SAMPLE_USAGE}
        defense={SAMPLE_DEFENSE}
        news={SAMPLE_NEWS}
        peers={[
          {
            player_id: "00-0038542",
            display_name: "Bijan Robinson",
            team: "ATL",
            position: "RB",
            fpts_dk_mean: 21.8,
          },
        ]}
      />,
    );

    expect(screen.getByText("Holistic Rating")).toBeInTheDocument();
    expect(screen.getByText("ELITE")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /AI Holistic Brief/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Jahmyr Gibbs grades as an ELITE play against Green Bay."),
      ).toBeInTheDocument();
    });

    vi.unstubAllGlobals();
  });
});
