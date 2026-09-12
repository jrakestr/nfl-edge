import { render, screen } from "@testing-library/react";
import { PlayersList } from "./PlayersList";
import type { WeekPlayer } from "@/lib/types";
import { REBUILD_PENDING } from "@/lib/injury-status";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/week/1/players/dk/main",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const RUN = "2026-09-12T03:00:00.000Z";

const staleOut: WeekPlayer = {
  player_id: "00-out",
  display_name: "Stale Out",
  position: "WR",
  team: "DET",
  game_id: "g1",
  fpts_dk_mean: 14.4,
  typical_dk: 12,
  hist: null,
  override_status: "out",
  override_updated_at: "2026-09-12T03:01:00.000Z",
  run_created_at: RUN,
};

const qAfter: WeekPlayer = {
  player_id: "00-q",
  display_name: "Q After",
  position: "RB",
  team: "DET",
  game_id: "g1",
  fpts_dk_mean: 18.2,
  typical_dk: 20,
  hist: null,
  override_status: "questionable",
  override_updated_at: "2026-09-12T03:01:00.000Z",
  run_created_at: RUN,
};

describe("PlayersList injury status", () => {
  it("greys a post-run OUT and excludes him from the optimizer pool", () => {
    render(<PlayersList players={[staleOut]} />);
    const row = screen.getByRole("row", { name: /stale out/i });
    expect(row).toHaveAttribute("data-in-pool", "false");
    expect(screen.getByLabelText("OUT")).toHaveTextContent("OUT");
    expect(screen.getByText(REBUILD_PENDING)).toBeInTheDocument();
    expect(screen.getByText("14.4")).toHaveClass("text-muted-foreground");
  });

  it("shows Q without greying when the override postdates the run", () => {
    render(<PlayersList players={[qAfter]} />);
    const row = screen.getByRole("row", { name: /q after/i });
    expect(row).toHaveAttribute("data-in-pool", "true");
    expect(screen.getByLabelText("Q")).toHaveTextContent("Q");
    expect(screen.queryByText(REBUILD_PENDING)).not.toBeInTheDocument();
    expect(screen.getByText("18.2")).toHaveClass("text-foreground");
  });
});
