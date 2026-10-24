import { fireEvent, render, screen } from "@testing-library/react";
import { UsagePanel } from "@/components/prop/UsagePanel";
import type { PlayerUsage, UsageRates } from "@/lib/usage";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/props",
  useSearchParams: () => new URLSearchParams(),
}));

function rates(window: "season" | "l3", games: number, fpPerTarget: number): UsageRates {
  return {
    window,
    games,
    dk_pg: 9.7,
    ppr_pg: 9.2,
    half_pg: 7.5,
    std_pg: 5.8,
    ppr_6pt_pg: 9.2,
    fp_per_target: fpPerTarget,
    fp_per_opportunity: 1.38,
    fp_per_touch: 2.3,
    fp_per_snap: 0.233,
    fp_per_route_est: 0.41,
    fp_per_rush: null,
    fp_per_dropback: null,
    fp_per_attempt: null,
    target_share: 0.226,
    snap_pct: 0.68,
    routes_pg_est: 23.6,
    targets_pg: 6.3,
    carries_pg: 0.2,
    yprr_est: 1.59,
    tprr_est: 0.265,
    air_yds_pg: 61,
    wopr: 0.5,
  };
}

const USAGE: PlayerUsage = {
  season: rates("season", 6, 1.53),
  l3: rates("l3", 3, 1.43),
  ranks: [
    { metric: "fp_per_target", rank: 41, of: 64 },
    { metric: "target_share", rank: 12, of: 64 },
  ],
  weeks: [
    {
      season: 2026,
      week: 6,
      opponent: "SEA",
      snap_pct: 0.66,
      routes_est: 23,
      targets: 5,
      carries: 0,
      target_share: 0.2,
      fpts_dk: 6.4,
      fpts_ppr: 6.4,
    },
  ],
};

describe("UsagePanel", () => {
  it("shows position rates with ranks, scoring bands, the defense sentence and weekly rows", () => {
    render(
      <UsagePanel
        usage={USAGE}
        position="WR"
        opponent="ARI"
        defense={{ defense: "ARI", position: "WR", games: 6, allowed_pg: 35.9, league_avg: 33.2, rank: 2, of: 32 }}
        fptsHist={{ bins: [0, 10, 20], counts: [60, 40] }}
      />,
    );
    expect(screen.getByText("Points per target")).toBeInTheDocument();
    expect(screen.getByText("1.53")).toBeInTheDocument();
    expect(screen.getByText("41st of 64")).toBeInTheDocument();
    expect(screen.getByText("23%")).toBeInTheDocument(); // target share
    expect(screen.queryByText("Points per dropback")).not.toBeInTheDocument();
    // Bands: 60 draws in 0-10 split evenly -> 30% in 0-5.
    const bands = screen.getByRole("list", { name: "Scoring bands" });
    expect(bands).toHaveTextContent("0–5");
    expect(bands).toHaveTextContent("30%");
    expect(screen.getByText(/ARI allows 2\.7 more DK points per game to WRs than average/)).toBeInTheDocument();
    expect(screen.getByLabelText("Weekly usage")).toHaveTextContent("SEA");
  });

  it("switches to the last-3 window and drops season ranks", () => {
    render(<UsagePanel usage={USAGE} position="WR" opponent={null} defense={null} fptsHist={null} />);
    fireEvent.click(screen.getByRole("radio", { name: "Last 3" }));
    expect(screen.getByText("1.43")).toBeInTheDocument();
    expect(screen.queryByText("41st of 64")).not.toBeInTheDocument();
    expect(screen.getByText("No histogram on this run.")).toBeInTheDocument();
    expect(screen.getByText(/No points-allowed data/)).toBeInTheDocument();
  });

  it("explains an empty season", () => {
    render(<UsagePanel usage={null} position="RB" opponent={null} defense={null} fptsHist={null} />);
    expect(screen.getByText("No graded games this season yet.")).toBeInTheDocument();
  });
});
