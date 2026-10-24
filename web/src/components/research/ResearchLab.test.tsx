import { render, screen, within } from "@testing-library/react";
import { LineupAuditSection, ResearchLab } from "./ResearchLab";
import { composeLineupAudit, evaluatePlayerVerdict, type PoolPlayer } from "@/lib/research/questions";
import type { Metric, ScoredPlayer } from "@/lib/research/score";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/research",
  useSearchParams: () => new URLSearchParams(),
}));

const METRIC: Metric = { id: "1", name: "Volume", normalize: "zscore", terms: [{ field: "target_share", weight: 2 }] };

const ROWS: ScoredPlayer[] = [
  {
    playerId: "a",
    name: "Amon-Ra St. Brown",
    team: "DET",
    position: "WR",
    fields: { target_share: 0.3, dk_salary: 8000, sim_dk_mean: 18.5, sim_dk_p90: 29.0, sim_value_x: 2.31 },
    scores: { "1": { value: 1.5, missing: [], rank: 1, positionRank: 1 } },
  },
  {
    playerId: "b",
    name: "Rookie Guy",
    team: "DET",
    position: "WR",
    fields: { target_share: null, dk_salary: 4500, sim_dk_mean: 8.2, sim_dk_p90: 15.1, sim_value_x: 1.82 },
    scores: { "1": { value: null, missing: ["Target share"], rank: null, positionRank: null } },
  },
];

const POOL: Record<string, PoolPlayer> = {
  a: {
    playerId: "a",
    name: "Amon-Ra St. Brown",
    team: "DET",
    position: "WR",
    salary: 8000,
    projDkMean: 18.5,
    verdict: "KEEP",
    reasons: ["Cleared all injury and role checks."],
    boost: false,
    headline: "St. Brown practices in full Friday",
  },
  b: {
    playerId: "b",
    name: "Rookie Guy",
    team: "DET",
    position: "WR",
    salary: 4500,
    projDkMean: 8.2,
    verdict: "VETO",
    reasons: ["Snap count / pitch count risk (p=0.88)"],
    boost: false,
    headline: "Coach says Rookie Guy will be on a strict snap count",
  },
  c: {
    playerId: "c",
    name: "Jameson Williams",
    team: "DET",
    position: "WR",
    salary: 4400,
    projDkMean: 12.4,
    verdict: "KEEP",
    reasons: ["Cleared all injury and role checks."],
    boost: true,
    headline: "Williams set for expanded deep role",
  },
};

describe("evaluatePlayerVerdict & composeLineupAudit", () => {
  it("evaluates VETO on high-probability snap cap and NO_READ on empty judgments", () => {
    expect(evaluatePlayerVerdict({}).verdict).toBe("NO_READ");
    const veto = evaluatePlayerVerdict({
      snap_cap_risk: { kind: "noul", value: 0.9, confidence: null },
    });
    expect(veto.verdict).toBe("VETO");
    expect(veto.reasons[0]).toContain("Snap count / pitch count risk");
  });

  it("identifies weakest slot and suggests cap-legal KEEP swaps ranked by sim mean", () => {
    const audited = composeLineupAudit(
      {
        lineupId: "lu-1",
        salaryUsed: 49900,
        projFpts: 132.5,
        simWinPct: 0.04,
        simRoi: 0.25,
        players: [
          { slot: "WR1", player_id: "a", name: "Amon-Ra St. Brown", salary: 8000 },
          { slot: "WR2", player_id: "b", name: "Rookie Guy", salary: 4500 },
        ],
      },
      POOL,
    );
    expect(audited.status).toBe("VETOED");
    expect(audited.weakestSlot?.playerId).toBe("b");
    expect(audited.weakestSlot?.swaps).toHaveLength(1);
    expect(audited.weakestSlot?.swaps[0]?.playerId).toBe("c");
    expect(audited.weakestSlot?.swaps[0]?.projDelta).toBeCloseTo(4.2);
  });
});

describe("ResearchLab UI", () => {
  it("renders player verdicts, sim context columns, and metric scores without a Run Jev button", () => {
    render(<ResearchLab rows={ROWS} metrics={[METRIC]} metricErrors={{}} poolByPid={POOL} />);
    expect(screen.queryByRole("button", { name: /Run Jev/i })).toBeNull();
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]!).getByText("KEEP")).toBeInTheDocument();
    expect(within(rows[1]!).getByText(/\+1\.50/)).toBeInTheDocument();
    expect(within(rows[2]!).getByText("VETO")).toBeInTheDocument();
    expect(within(rows[2]!).getByTitle("Missing: Target share")).toHaveTextContent("—");
  });

  it("renders LineupAuditSection with weakest slot, news headline, and swap candidates", () => {
    const lu = composeLineupAudit(
      {
        lineupId: "lu-1",
        salaryUsed: 49900,
        projFpts: 132.5,
        simWinPct: 0.04,
        simRoi: 0.25,
        players: [
          { slot: "WR1", player_id: "a", name: "Amon-Ra St. Brown", salary: 8000 },
          { slot: "WR2", player_id: "b", name: "Rookie Guy", salary: 4500 },
        ],
      },
      POOL,
    );
    render(
      <LineupAuditSection
        week={7}
        slate="main"
        auditedAt="2026-10-23T18:00:00Z"
        modelResolved="jev-1.13"
        auditedPlayerCount={3}
        lineups={[lu]}
      />,
    );
    expect(screen.getByText("Jev Lineup Audit")).toBeInTheDocument();
    expect(screen.getByText(/Coach says Rookie Guy will be on a strict snap count/)).toBeInTheDocument();
    expect(screen.getByText("Jameson Williams")).toBeInTheDocument();
  });
});
