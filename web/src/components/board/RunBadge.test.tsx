import { render, screen } from "@testing-library/react";
import { RunBadge } from "./RunBadge";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/week/1",
  useSearchParams: () => new URLSearchParams(),
}));

const run = {
  run_id: "5823f735-0431-4faf-b175-edb980000001",
  created_at: "2026-09-06T19:20:00.000Z",
  draws_per_game: 20000,
  git_sha: null,
};

describe("RunBadge", () => {
  it("warns when lines and verdicts timestamps drift", () => {
    render(
      <RunBadge
        run={run}
        runs={[run]}
        stale={false}
        linesAsOf="2026-09-12T17:32:00.000Z"
        verdictsAsOf="2026-09-12T16:00:00.000Z"
      />,
    );
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveAttribute("data-stale", "true");
    expect(trigger).toHaveAccessibleName(/verdicts behind the line/);
    expect(trigger).toHaveAccessibleName(/lines as of/);
  });

  it("does not warn when the two stamps match", () => {
    render(
      <RunBadge
        run={run}
        runs={[run]}
        stale={false}
        linesAsOf="2026-09-12T17:32:00.000Z"
        verdictsAsOf="2026-09-12T17:32:00.000Z"
      />,
    );
    expect(screen.getByRole("combobox")).not.toHaveAttribute("data-stale");
  });

  it("labels a run whose draws were pruned", () => {
    render(<RunBadge run={{ ...run, draws_pruned: true }} runs={[{ ...run, draws_pruned: true }]} stale={false} />);
    expect(screen.getByRole("combobox")).toHaveAccessibleName(/draws pruned/);
  });

  it("with no run shows lines as of only", () => {
    render(<RunBadge run={null} runs={[]} stale={false} linesAsOf="2026-09-12T17:32:00.000Z" />);
    expect(screen.getByText(/lines as of/)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("appends the plain-words line source", () => {
    render(
      <RunBadge
        run={run}
        runs={[run]}
        stale={false}
        linesAsOf="2026-09-20T02:21:57.000Z"
        verdictsAsOf="2026-09-20T02:21:57.000Z"
        linesSource="DraftKings"
      />,
    );
    expect(screen.getByRole("combobox")).toHaveAccessibleName(/DraftKings/);
    expect(screen.getByRole("combobox")).not.toHaveAccessibleName(/odds_api|nflverse/);
  });
});

