import { fireEvent, render, screen } from "@testing-library/react";
import { PLAYER_CELL, PlayersList } from "./PlayersList";
import type { WeekPlayer } from "@/lib/types";
import { REBUILD_PENDING } from "@/lib/injury-status";
import { slateStorageKey } from "@/lib/slate-picks";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn(), refresh: vi.fn() }),
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

const MAIN: WeekPlayer[] = [
  {
    player_id: "00-gibbs",
    player_dk_id: "111",
    display_name: "Jahmyr Gibbs",
    position: "RB",
    team: "DET",
    opponent: "NO",
    kickoff: "Sun 1:00 PM",
    game_id: "g1",
    salary: 8000,
    fpts_dk_mean: 18.2,
    floor: 10,
    ceiling: 28,
    proj_own: 0.22,
    value: 2.275,
    typical_dk: 20,
    hist: null,
  },
  {
    player_id: "00-main-only",
    player_dk_id: "222",
    display_name: "Main Only",
    position: "WR",
    team: "KC",
    opponent: "LAC",
    kickoff: "Sun 1:00 PM",
    game_id: "g2",
    salary: 5000,
    fpts_dk_mean: 9.1,
    floor: 4,
    ceiling: 16,
    proj_own: 0.05,
    value: 1.82,
    typical_dk: 8,
    hist: null,
  },
];

const FULL: WeekPlayer[] = [
  {
    ...MAIN[0]!,
    player_dk_id: "999",
    salary: 8100,
    value: 2.247,
  },
  {
    player_id: "00-full-only",
    player_dk_id: "333",
    display_name: "Full Only",
    position: "TE",
    team: "BUF",
    opponent: "BAL",
    kickoff: "Sun 1:00 PM",
    game_id: "g3",
    salary: 4200,
    fpts_dk_mean: 8.4,
    floor: 3,
    ceiling: 15,
    proj_own: 0.04,
    value: 2.0,
    typical_dk: 7,
    hist: null,
  },
];

describe("PlayersList slate rows", () => {
  it("shows a notice when the slate fell back to main", () => {
    render(<PlayersList players={MAIN} fallbackFrom="nope" />);
    expect(screen.getByText(/Unknown slate “nope”; showing Main/)).toBeInTheDocument();
  });

  it("switching Main to Full changes the player count and DK IDs", () => {
    const { rerender } = render(<PlayersList players={MAIN} />);
    expect(screen.getByText("111")).toBeInTheDocument();
    expect(screen.getByText("222")).toBeInTheDocument();
    expect(screen.queryByText("333")).not.toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2

    rerender(<PlayersList players={FULL} />);
    expect(screen.getByText("999")).toBeInTheDocument();
    expect(screen.queryByText("111")).not.toBeInTheDocument();
    expect(screen.getByText("333")).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
    expect(screen.getByText("Jahmyr Gibbs")).toBeInTheDocument();
  });

  it("FLEX row shows the real position, never a FLEX chip", () => {
    render(<PlayersList players={MAIN} />);
    expect(screen.getByLabelText("RB")).toBeInTheDocument();
    expect(screen.getByLabelText("WR")).toBeInTheDocument();
    expect(screen.queryByLabelText("FLEX")).not.toBeInTheDocument();
  });

  it("lock writes URL and per-slate localStorage", () => {
    replace.mockClear();
    localStorage.clear();
    render(<PlayersList players={MAIN} slateId="2026_01_main" week={1} site="dk" slate="main" />);
    fireEvent.click(screen.getByRole("button", { name: "Lock Jahmyr Gibbs" }));
    expect(replace).toHaveBeenCalled();
    const href = String(replace.mock.calls.at(-1)?.[0]);
    expect(href).toContain("lock=111");
    expect(JSON.parse(localStorage.getItem(slateStorageKey("2026_01_main"))!)).toMatchObject({
      lock: ["111"],
    });
  });

  it("summary bar starts at zero and the CTA is enabled", () => {
    render(<PlayersList players={MAIN} week={1} site="dk" slate="main" />);
    expect(screen.getByRole("complementary", { name: "Pick summary" })).toHaveTextContent(
      "Locked 0 · Excluded 0 · Stacked 0",
    );
    expect(screen.getByRole("link", { name: "Build lineups with these →" })).toHaveAttribute(
      "href",
      "/week/1/optimize/dk/main",
    );
  });

  it("row actions update counts and Clear all zeros them", () => {
    replace.mockClear();
    localStorage.clear();
    render(<PlayersList players={MAIN} slateId="2026_01_main" week={1} site="dk" slate="main" />);
    fireEvent.click(screen.getByRole("button", { name: "Lock Jahmyr Gibbs" }));
    fireEvent.click(screen.getByRole("button", { name: "Exclude Main Only" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Jahmyr Gibbs to stack" }));
    expect(screen.getByRole("complementary", { name: "Pick summary" })).toHaveTextContent(
      "Locked 1 · Excluded 1 · Stacked 1",
    );
    const locked = screen.getByRole("row", { name: /jahmyr gibbs/i });
    const unlocked = screen.getByRole("row", { name: /main only/i });
    expect(locked).toHaveAttribute("data-locked", "true");
    expect(locked).toHaveAttribute("data-stacked", "true");
    expect(unlocked).toHaveAttribute("data-excluded", "true");
    expect(unlocked).not.toHaveAttribute("data-locked");
    expect(locked.querySelector("td")).toHaveClass(PLAYER_CELL);
    expect(screen.getByRole("button", { name: "Lock Jahmyr Gibbs" })).toHaveClass("bg-edge-pos-tint");
    expect(screen.getByRole("button", { name: "Add Jahmyr Gibbs to stack" })).toHaveClass("bg-line-tint");
    expect(screen.getByRole("button", { name: "Exclude Main Only" })).toHaveClass("bg-edge-neg-tint");
    expect(screen.getByRole("link", { name: "Build lineups with these →" }).getAttribute("href")).toContain(
      "lock=111",
    );
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(screen.getByRole("complementary", { name: "Pick summary" })).toHaveTextContent(
      "Locked 0 · Excluded 0 · Stacked 0",
    );
  });
});

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
