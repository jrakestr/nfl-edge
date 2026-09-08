import { render, screen } from "@testing-library/react";
import { PositionPill, normalizePosition } from "./PositionPill";

describe("PositionPill", () => {
  it("renders the real position, never FLEX", () => {
    render(<PositionPill position="WR" />);
    expect(screen.getByLabelText("WR")).toHaveTextContent("WR");
    expect(normalizePosition("FLEX")).toBeNull();
    expect(normalizePosition("DEF")).toBe("DST");
  });
});
