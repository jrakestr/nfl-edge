import { render, screen } from "@testing-library/react";
import { PaceFigure } from "./PaceFigure";

describe("PaceFigure", () => {
  it("colors a player ahead of pace and shows weeks left and points remaining", () => {
    const { container } = render(<PaceFigure pts={124.5} proj={352.5} weeksDone={4} seasonWeeks={14} />);
    const colored = container.querySelector("[data-edge]");
    expect(colored?.textContent).toBe("35%");
    expect(colored).toHaveAttribute("data-edge", "pos");
    expect(colored).toHaveAttribute("data-intensity", "strong");
    expect(screen.getByText("10 weeks left, 228.0 still to score")).toBeInTheDocument();
  });

  it("colors a player behind pace", () => {
    const { container } = render(<PaceFigure pts={40} proj={200} weeksDone={4} seasonWeeks={14} />);
    expect(container.querySelector("[data-edge]")).toHaveAttribute("data-edge", "neg");
  });

  it("stays uncolored when no week is final, and still shows the clock", () => {
    const { container } = render(<PaceFigure pts={10} proj={100} weeksDone={0} seasonWeeks={14} />);
    expect(container.querySelector("[data-edge]")).toBeNull();
    expect(screen.getByText("10%")).toBeInTheDocument();
    expect(screen.getByText("14 weeks left, 90.0 still to score")).toBeInTheDocument();
  });

  it("stays uncolored with no projection", () => {
    const { container } = render(<PaceFigure pts={10} proj={null} weeksDone={4} seasonWeeks={14} />);
    expect(container.querySelector("[data-edge]")).toBeNull();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/weeks left/)).toBeNull();
  });
});
