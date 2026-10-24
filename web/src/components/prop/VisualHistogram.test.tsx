import { fireEvent, render, screen } from "@testing-library/react";
import { VisualHistogram, computeHistStats, probOverLine } from "./VisualHistogram";
import type { Hist } from "@/lib/types";

const SAMPLE_HIST: Hist = {
  bins: [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
  counts: [5, 10, 20, 35, 50, 50, 35, 20, 10, 5],
};

describe("VisualHistogram", () => {
  it("computes quantiles and probability over line accurately", () => {
    const stats = computeHistStats(SAMPLE_HIST);
    expect(stats).not.toBeNull();
    expect(stats!.total).toBe(240);
    expect(stats!.p50).toBeCloseTo(50, 1);
    expect(stats!.mean).toBeCloseTo(50, 1);

    expect(probOverLine(SAMPLE_HIST, 50)).toBeCloseTo(0.5, 2);
    expect(probOverLine(SAMPLE_HIST, 0)).toBeCloseTo(1, 2);
    expect(probOverLine(SAMPLE_HIST, 100)).toBeCloseTo(0, 2);
  });

  it("renders 20-bin bars, quantile markers, hover tooltip, and line scrubber", () => {
    render(<VisualHistogram hist={SAMPLE_HIST} line={45.5} fairLine={50} title="Where his yards land" />);
    expect(screen.getByText("Where his yards land")).toBeInTheDocument();
    expect(screen.getByTestId("histogram-p-over")).toHaveTextContent("59.4%");
    expect(screen.getByText("P10")).toBeInTheDocument();
    expect(screen.getByText("P90")).toBeInTheDocument();

    // Hover a bin
    fireEvent.mouseEnter(screen.getByTestId("hist-bin-4"));
    expect(screen.getByTestId("hist-tooltip")).toHaveTextContent("Range 40.0–50.0");

    // Scrub custom line
    const slider = screen.getByLabelText("Test custom line");
    fireEvent.change(slider, { target: { value: "60" } });
    expect(screen.getByTestId("histogram-p-over")).toHaveTextContent("29.2%");

    // Reset button restores original line
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByTestId("histogram-p-over")).toHaveTextContent("59.4%");
  });

  it("renders empty state when hist is null", () => {
    render(<VisualHistogram hist={null} />);
    expect(screen.getByText("No histogram on this run.")).toBeInTheDocument();
  });
});
