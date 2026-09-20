import { fireEvent, render, screen } from "@testing-library/react";
import { GamesSelectionProvider } from "@/components/shell/GamesSelection";
import type { StripGame } from "@/lib/kickoff";
import { PLAYER_CELL, PlayersList } from "./PlayersList";
import type { WeekPlayer } from "@/lib/types";
import { REBUILD_PENDING } from "@/lib/injury-status";
import { slateStorageKey } from "@/lib/slate-picks";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/week/1/players/dk/main",
  useSearchParams: () => search,
}));

beforeEach(() => {
  search = new URLSearchParams();
});

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

const noProjWr: WeekPlayer = {
  player_id: "00-noproj-wr",
  player_dk_id: "444",
  display_name: "No Proj WR",
  position: "WR",
  team: "SEA",
  opponent: "SF",
  kickoff: "Sun 1:00 PM",
  game_id: "g4",
  salary: 3000,
  fpts_dk_mean: null,
  typical_dk: 4,
  hist: null,
};

const noProjRb: WeekPlayer = {
  player_id: "00-noproj-rb",
  player_dk_id: "555",
  display_name: "No Proj RB",
  position: "RB",
  team: "CHI",
  opponent: "MIN",
  kickoff: "Sun 1:00 PM",
  game_id: "g5",
  salary: 3200,
  fpts_dk_mean: null,
  typical_dk: 3,
  hist: null,
};

const zeroProj: WeekPlayer = {
  player_id: "00-zero",
  player_dk_id: "666",
  display_name: "Zero Proj",
  position: "TE",
  team: "GB",
  opponent: "DET",
  kickoff: "Sun 1:00 PM",
  game_id: "g6",
  salary: 2500,
  fpts_dk_mean: 0,
  typical_dk: 1,
  hist: null,
};

const WITH_UNPROJ: WeekPlayer[] = [...MAIN, noProjWr, noProjRb, zeroProj];

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
    expect(screen.getByText(/Nope is listed for this week but has no salary rows/)).toBeInTheDocument();
  });

  it("switching Main to Full changes the player count", () => {
    const { rerender } = render(<PlayersList players={MAIN} />);
    expect(screen.getByText("Jahmyr Gibbs")).toBeInTheDocument();
    expect(screen.getByText("Main Only")).toBeInTheDocument();
    expect(screen.queryByText("Full Only")).not.toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3); // header + 2
    expect(screen.queryByRole("columnheader", { name: "DK ID" })).not.toBeInTheDocument();

    rerender(<PlayersList players={FULL} />);
    expect(screen.getByText("Jahmyr Gibbs")).toBeInTheDocument();
    expect(screen.getByText("Full Only")).toBeInTheDocument();
    expect(screen.queryByText("Main Only")).not.toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(3);
  });

  it("shows ceiling and pts rank and not leverage, floor, or extra ranks", () => {
    render(<PlayersList players={MAIN} />);
    expect(screen.getByRole("columnheader", { name: "Ceiling" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Pts rk" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Val rk" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Ceil rk" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Leverage" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Floor / ceil" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Floor" })).not.toBeInTheDocument();
  });

  it("opens on the value sort from ?sort=value&dir=desc", () => {
    search = new URLSearchParams("sort=value&dir=desc");
    render(<PlayersList players={[...MAIN].reverse()} />);
    const rows = screen.getAllByRole("row");
    // Header + 2 players: highest value first despite the input order.
    expect(rows[1]).toHaveTextContent("Jahmyr Gibbs");
    expect(rows[2]).toHaveTextContent("Main Only");
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

  it("row actions update counts and Clear picks zeros them", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Clear picks" }));
    expect(screen.getByRole("complementary", { name: "Pick summary" })).toHaveTextContent(
      "Locked 0 · Excluded 0 · Stacked 0",
    );
  });
});

describe("PlayersList hide unprojected", () => {
  it("hides null-projection rows by default and keeps a zero projection", () => {
    render(<PlayersList players={WITH_UNPROJ} />);
    expect(screen.getByRole("checkbox", { name: "Hide unprojected" })).toBeChecked();
    expect(screen.getByText("hiding 2 with no projection")).toBeInTheDocument();
    expect(screen.queryByText("No Proj WR")).not.toBeInTheDocument();
    expect(screen.queryByText("No Proj RB")).not.toBeInTheDocument();
    expect(screen.getByText("Zero Proj")).toBeInTheDocument();
    expect(screen.getByText("Jahmyr Gibbs")).toBeInTheDocument();
  });

  it("unchecking shows null-projection rows and writes showunproj=1", () => {
    replace.mockClear();
    render(<PlayersList players={WITH_UNPROJ} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Hide unprojected" }));
    expect(screen.getByText("No Proj WR")).toBeInTheDocument();
    expect(screen.getByText("No Proj RB")).toBeInTheDocument();
    expect(screen.getByText("2 with no projection")).toBeInTheDocument();
    expect(screen.queryByText("hiding 2 with no projection")).not.toBeInTheDocument();
    const href = String(replace.mock.calls.at(-1)?.[0]);
    expect(href).toContain("showunproj=1");
  });

  it("counts null-projection rows after other filters, not the whole slate", () => {
    render(<PlayersList players={WITH_UNPROJ} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Position" }), { target: { value: "WR" } });
    expect(screen.getByText("hiding 1 with no projection")).toBeInTheDocument();
    expect(screen.queryByText("hiding 2 with no projection")).not.toBeInTheDocument();
    expect(screen.queryByText("No Proj WR")).not.toBeInTheDocument();
    expect(screen.getByText("Main Only")).toBeInTheDocument();
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

const STRIP: StripGame[] = [
  {
    game_id: "g1",
    away: "NO",
    home: "DET",
    gameday: "2026-09-13",
    gametime: "13:00",
    location: "Home",
    away_score: null,
    home_score: null,
    is_final: false,
  },
  {
    game_id: "g2",
    away: "KC",
    home: "LAC",
    gameday: "2026-09-13",
    gametime: "13:00",
    location: "Home",
    away_score: null,
    home_score: null,
    is_final: false,
  },
];

describe("PlayersList game strip", () => {
  it("filters rows from chips and has no Game select", () => {
    render(
      <GamesSelectionProvider>
        <PlayersList players={MAIN} strip={STRIP} />
      </GamesSelectionProvider>,
    );
    expect(screen.getByLabelText("Team")).toBeInTheDocument();
    expect(screen.queryByLabelText("Game")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "NO at DET" }));
    expect(screen.getByRole("row", { name: /jahmyr gibbs/i })).toBeInTheDocument();
    expect(screen.queryByRole("row", { name: /main only/i })).toBeNull();
  });
});

describe("PlayersList NFLGameSim", () => {
  const NGS: WeekPlayer[] = [{ ...MAIN[0]!, ngs_fpts: 36.9 }, { ...MAIN[1]!, ngs_fpts: 20.1 }];

  it("shows a muted NFLGameSim column beside DK pts", () => {
    render(<PlayersList players={NGS} />);
    expect(screen.getByRole("columnheader", { name: "NFLGameSim" })).toBeInTheDocument();
    expect(screen.getByText("36.9")).toHaveClass("t-caption", "text-muted-foreground");
    // DK pts keeps the model treatment.
    expect(screen.getByText("18.2")).toHaveClass("text-foreground");
  });

  it("shows an em dash when the bench is absent", () => {
    render(<PlayersList players={[{ ...MAIN[0]!, ngs_fpts: 36.9 }, { ...MAIN[1]! }]} />);
    const row = screen.getByRole("row", { name: /main only/i });
    expect(row).toHaveTextContent("—");
  });

  it("hide-unprojected still keys off our projection, not the bench", () => {
    render(<PlayersList players={[...NGS, noProjWr]} />);
    expect(screen.getByText("hiding 1 with no projection")).toBeInTheDocument();
    expect(screen.getByText("Jahmyr Gibbs")).toBeInTheDocument();
  });

  it("sorts by the bench from ?sort=ngs&dir=desc", () => {
    search = new URLSearchParams("sort=ngs&dir=desc");
    render(<PlayersList players={[...NGS].reverse()} />);
    const rows = screen.getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Jahmyr Gibbs");
    expect(rows[2]).toHaveTextContent("Main Only");
  });
});
