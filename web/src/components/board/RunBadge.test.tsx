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
});
