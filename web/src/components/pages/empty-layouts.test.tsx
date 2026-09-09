import { render, screen } from "@testing-library/react";
import { GamesList } from "@/components/games/GamesList";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock("@/lib/actions/dfs-export", () => ({
  exportSelectedLineups: async () => "",
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/props",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/actions/save-market-line", () => ({
  saveMarketLine: async () => ({ ok: true }),
}));
import { PlayersList } from "@/components/players/PlayersList";
import { FairPropsIndex } from "@/components/props/FairPropsIndex";
import { GradingPage } from "@/components/grading/GradingPage";
import { LineupReview } from "@/components/dfs/LineupReview";
import { OptimizerPage } from "@/components/optimize/OptimizerPage";

describe("empty sidebar layouts", () => {
  it("Games: table chrome and empty copy", () => {
    render(<GamesList />);
    expect(screen.getByRole("heading", { name: "Games" })).toBeInTheDocument();
    expect(screen.getByText("No games listed yet")).toBeInTheDocument();
    expect(screen.getByText("Matchup")).toBeInTheDocument();
    expect(screen.getByText("Sim score")).toBeInTheDocument();
  });

  it("Players: search and empty table", () => {
    render(<PlayersList />);
    expect(screen.getByRole("heading", { name: "Players" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Name or team")).toBeEnabled();
    expect(screen.getByText("No players on this slate yet")).toBeInTheDocument();
  });

  it("Props index: empty fair list", () => {
    render(<FairPropsIndex />);
    expect(screen.getByRole("heading", { name: "Props" })).toBeInTheDocument();
    expect(screen.getByText("No fair lines yet")).toBeInTheDocument();
    expect(screen.getByText("Our line")).toBeInTheDocument();
  });

  it("Lineups: site/slate chrome and empty list for unknown ids", () => {
    render(<LineupReview week="99" site="xx" slate="yy" />);
    expect(screen.getByRole("heading", { name: "Week 99 · XX · yy" })).toBeInTheDocument();
    expect(screen.getByText("No lineups for this slate yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export selected" })).toBeDisabled();
    expect(screen.getByText("DraftKings")).toBeInTheDocument();
    expect(screen.getByText("Showdown")).toBeInTheDocument();
  });

  it("Showdown empty card shows CPT, not classic slots", () => {
    render(<LineupReview week="1" site="dk" slate="showdown" />);
    expect(screen.getByText("CPT")).toBeInTheDocument();
    expect(screen.queryByText("QB")).not.toBeInTheDocument();
  });

  it("Optimize: settings chrome and empty build", () => {
    render(<OptimizerPage week="1" site="dk" slate="main" />);
    expect(screen.getByRole("heading", { name: "Optimize" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Generate" })).toBeDisabled();
    expect(screen.getByRole("tab", { name: "Sim 150" })).toBeInTheDocument();
    expect(screen.getByText(/Generate lineups around the locks/)).toBeInTheDocument();
  });

  it("Grading: Actual column, tiles, calibration slot", () => {
    render(<GradingPage />);
    expect(screen.getByRole("heading", { name: "Grading" })).toBeInTheDocument();
    expect(screen.getAllByText("No graded weeks yet").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Actual")).toBeInTheDocument();
    expect(screen.getByText("Chart fills in with grade-web")).toBeInTheDocument();
    expect(screen.getByText("Flat ROI")).toBeInTheDocument();
  });
});
