import { render, screen, within } from "@testing-library/react";
import { PlayerBias } from "@/components/grading/PlayerBias";
import type { BiasCell, PlayerBiasData } from "@/lib/player-bias";

function cell(over: Partial<BiasCell>): BiasCell {
  return {
    ord: 0,
    dimension: "position",
    label: "WR",
    n: 365,
    projected: 7.83,
    actual: 8.12,
    meanResid: 0.29,
    meanPct: 3.7,
    mae: 5.1,
    se: 0.36,
    weeksGraded: 3,
    state: "not enough evidence",
    reason: "difference is within one standard error",
    owner: null,
    ...over,
  };
}

const DATA: PlayerBiasData = {
  cells: [
    cell({}),
    cell({
      ord: 1,
      dimension: "carries",
      label: "RB",
      meanResid: 2.09,
      state: "candidate",
      reason: "same sign every week, beyond one standard error",
      owner: "usage shrink (carry share)",
    }),
  ],
  weeks: [1, 2, 3],
  compared: 906,
  didNotPlay: 544,
};

describe("PlayerBias", () => {
  it("shows the gate state in plain words and the owner channel for a passing cell", () => {
    render(<PlayerBias data={DATA} gradedWeeks={[1, 2, 3]} />);
    expect(screen.getByText("Passes the gate")).toBeInTheDocument();
    expect(screen.getByText(/Would go through usage shrink \(carry share\)/)).toBeInTheDocument();
    expect(screen.getByText(/Not enough evidence\. Difference is within one standard error/)).toBeInTheDocument();
    expect(screen.getByLabelText("Gate result")).toHaveTextContent("1 cell pass the gate");
    const carries = screen.getByRole("table", { name: "Carries" });
    expect(within(carries).getByText("+2.09")).toBeInTheDocument();
  });

  it("states that nothing here changes the model and excludes non-players", () => {
    render(<PlayerBias data={DATA} gradedWeeks={[1, 2, 3]} />);
    expect(screen.getByText(/nothing here changes the model/)).toBeInTheDocument();
    expect(screen.getByText(/544\s+projected but did not play/)).toBeInTheDocument();
  });

  it("names the graded weeks that have no comparison yet", () => {
    render(<PlayerBias data={DATA} gradedWeeks={[1, 2, 3, 4]} />);
    expect(screen.getByText(/Not compared yet: week 4\./)).toBeInTheDocument();
  });

  it("empty state names the weeks without a comparison", () => {
    render(<PlayerBias data={{ cells: [], weeks: [], compared: 0, didNotPlay: 0 }} gradedWeeks={[1, 2]} />);
    expect(screen.getByText(/No player comparison yet/)).toBeInTheDocument();
    expect(screen.getByText(/Weeks without one: 1, 2/)).toBeInTheDocument();
  });

  it("reports no eligible change when no cell passes", () => {
    render(
      <PlayerBias
        data={{ ...DATA, cells: [cell({})] }}
        gradedWeeks={[1, 2, 3]}
      />,
    );
    expect(screen.getByLabelText("Gate result")).toHaveTextContent(
      "No cell passes the gate. No prior change is eligible.",
    );
  });
});
