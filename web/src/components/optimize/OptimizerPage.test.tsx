import { fireEvent, render, screen } from "@testing-library/react";
import { OptimizerPage } from "@/components/optimize/OptimizerPage";
import { DET_NO_SLATE } from "@/lib/optimize/week1-fixture";
import type { DfsLineup } from "@/lib/types";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/week/1/optimize/dk/main",
  useSearchParams: () => new URLSearchParams("lock=gibbs,stbrown&x=monty&qb=DET&bb=NO&n=5&rand=20&exp=80"),
}));

const SIM: DfsLineup = {
  lineup_id: "0",
  salary_used: 50000,
  stack: "DET 4 + NO 1",
  proj_fpts: 140,
  sim_win_pct: 0.12,
  sim_roi: 0.4,
  players: [
    { slot: "QB", name: "Jared Goff", dk_id: "43791001" },
    { slot: "RB", name: "Jahmyr Gibbs", dk_id: "43791002" },
    { slot: "RB2", name: "Bijan Robinson", dk_id: "43791020" },
    { slot: "WR", name: "Amon-Ra St. Brown", dk_id: "43791004" },
    { slot: "WR2", name: "Jameson Williams", dk_id: "43791005" },
    { slot: "WR3", name: "Chris Olave", dk_id: "43791012" },
    { slot: "TE", name: "Sam LaPorta", dk_id: "43791006" },
    { slot: "FLEX", name: "Brandon Aiyuk", dk_id: "43791024" },
    { slot: "DST", name: "Eagles", dk_id: "43791030" },
  ],
};

describe("OptimizerPage", () => {
  it("generates 5 lineups around Gibbs, St. Brown, and the DET/NO stack", () => {
    render(
      <OptimizerPage
        week="1"
        site="dk"
        slate="main"
        runId="run-b"
        slateId="2026_01_main"
        players={DET_NO_SLATE}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(screen.getAllByRole("article").length).toBe(5);
    expect(screen.getAllByText("Gibbs").length).toBe(5);
    expect(screen.queryByText("Montgomery")).not.toBeInTheDocument();
  });

  it("Sim 150 tab has start from this lineup", () => {
    render(
      <OptimizerPage
        week="1"
        site="dk"
        slate="main"
        runId="run-b"
        slateId="2026_01_main"
        players={DET_NO_SLATE}
        simLineups={[SIM]}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Sim 150" }));
    expect(screen.getByRole("button", { name: "Start from this lineup" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start from this lineup" }));
    expect(replace).toHaveBeenCalled();
    const href = String(replace.mock.calls.at(-1)?.[0]);
    expect(href).toContain("lock=");
    expect(href).toContain("gibbs");
  });
});
