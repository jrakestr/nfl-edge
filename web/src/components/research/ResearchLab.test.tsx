import { render, screen, within } from "@testing-library/react";
import { ResearchLab, jevCellText } from "./ResearchLab";
import type { Metric, ScoredPlayer } from "@/lib/research/score";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/research",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/actions/research-metrics", () => ({
  saveResearchMetric: vi.fn(),
  deleteResearchMetric: vi.fn(),
}));

vi.mock("@/lib/actions/research-jev", () => ({
  estimateJevRun: vi.fn(),
  runJev: vi.fn(),
}));

const NO_KEY = { configured: false, reason: "TYPESAFE is not set" } as const;

const METRIC: Metric = { id: "1", name: "Volume", normalize: "zscore", terms: [{ field: "target_share", weight: 2 }] };

const ROWS: ScoredPlayer[] = [
  {
    playerId: "a",
    name: "Amon-Ra St. Brown",
    team: "DET",
    position: "WR",
    fields: { target_share: 0.3 },
    scores: { "1": { value: 1.5, missing: [], rank: 1, positionRank: 1 } },
  },
  {
    playerId: "b",
    name: "Rookie Guy",
    team: "DET",
    position: "WR",
    fields: { target_share: null },
    scores: { "1": { value: null, missing: ["Target share"], rank: null, positionRank: null } },
  },
];

describe("ResearchLab", () => {
  it("shows Not configured in every Jev cell when no key is set, never blank or a number", () => {
    render(
      <ResearchLab
        rows={ROWS}
        metrics={[METRIC]}
        metricErrors={{}}
        fields={["target_share"]}
        jev={NO_KEY}
        week={7}
        jevScores={{}}
      />,
    );
    expect(screen.getByText("Jev: Volume")).toBeInTheDocument();
    expect(screen.getAllByText("Not configured")).toHaveLength(ROWS.length);
  });

  it("renders the score with sign and position rank, and an em dash for a player missing a field", () => {
    render(
      <ResearchLab
        rows={ROWS}
        metrics={[METRIC]}
        metricErrors={{}}
        fields={["target_share"]}
        jev={NO_KEY}
        week={7}
        jevScores={{}}
      />,
    );
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]!).getByText(/\+1\.50/)).toBeInTheDocument();
    expect(within(rows[2]!).getByTitle("Missing: Target share")).toHaveTextContent("—");
  });

  it("lists metrics in plain English and flags a metric that could not score", () => {
    render(
      <ResearchLab
        rows={ROWS}
        metrics={[METRIC]}
        metricErrors={{ "1": ["Target share is not in this week's data."] }}
        fields={["target_share"]}
        jev={NO_KEY}
        week={7}
        jevScores={{}}
      />,
    );
    expect(screen.getByText(/Target share \(% of team targets\) × 2/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Not scored: Target share is not in this week's data.");
    expect(screen.queryByRole("columnheader", { name: /Volume/ })).toBeNull();
  });

  it("jevCellText never invents a score", () => {
    expect(jevCellText({ configured: false, reason: "r" })).toBe("Not configured");
    expect(jevCellText({ configured: true })).toBe("Not run");
    expect(jevCellText({ configured: true }, 2.345)).toBe("2.35");
  });

  it("shows cached Jev scores, Not run for uncached players, and the run panel when configured", () => {
    render(
      <ResearchLab
        rows={ROWS}
        metrics={[METRIC]}
        metricErrors={{}}
        fields={["target_share"]}
        jev={{ configured: true }}
        week={7}
        jevScores={{ "1": { a: 3.25 } }}
      />,
    );
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(within(rows[1]!).getByText("3.25")).toBeInTheDocument();
    expect(within(rows[2]!).getByText("Not run")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Estimate cost" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run Jev" })).toBeDisabled();
  });
});
