import { render } from "@testing-library/react";
import { LineupCard } from "@/components/dfs/LineupCard";
import { SummaryTiles } from "@/components/board/SummaryTiles";
import { METRIC_KEYS, METRICS } from "@/lib/icons";
import { NO_TRACK } from "@/test/fixture";
import type { DfsLineup } from "@/lib/types";

const LINEUP: DfsLineup = {
  lineup_id: "1",
  salary_used: 50000,
  stack: "DET 3",
  proj_fpts: 116.9,
  sim_win_pct: 0.31,
  sim_roi: 0.12,
  players: [{ slot: "QB", name: "Jared Goff", dk_id: "1" }],
};

const EMOJI = /\p{Extended_Pictographic}/u;

describe("icons", () => {
  it("maps every metric to a Lucide icon", () => {
    expect([...METRIC_KEYS].sort()).toEqual(
      [
        "edge",
        "exclude",
        "leverage",
        "lock",
        "ownership",
        "projection",
        "roi",
        "salary",
        "stack",
        "value",
        "winPct",
      ].sort(),
    );
    for (const key of METRIC_KEYS) {
      expect(METRICS[key]).toBeTypeOf("object");
    }
  });

  it("LineupCard renders svg, not emoji", () => {
    const { container } = render(<LineupCard lineup={LINEUP} />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.textContent ?? "").not.toMatch(EMOJI);
  });

  it("summary tiles render svg, not emoji", () => {
    const { container } = render(<SummaryTiles payloads={[]} track={NO_TRACK} />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.textContent ?? "").not.toMatch(EMOJI);
  });
});
