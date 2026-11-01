import { render, screen } from "@testing-library/react";
import { PositionPill, defenderPosition, normalizePosition } from "./PositionPill";

describe("PositionPill", () => {
  it("renders the real position, never FLEX", () => {
    render(<PositionPill position="WR" />);
    expect(screen.getByLabelText("WR")).toHaveTextContent("WR");
    expect(normalizePosition("FLEX")).toBeNull();
    expect(normalizePosition("DEF")).toBe("DST");
  });

  it("labels defenders without making them a DFS position", () => {
    render(<PositionPill position="lb" />);
    expect(screen.getByLabelText("LB")).toHaveTextContent("LB");
    expect(normalizePosition("LB")).toBeNull();
    expect(defenderPosition("DB")).toBe("DB");
    expect(defenderPosition("OL")).toBeNull();
  });

  it.each([
    ["QB", "bg-pos-qb"],
    ["RB", "bg-pos-rb"],
    ["WR", "bg-pos-wr"],
    ["TE", "bg-pos-te"],
    ["DST", "bg-pos-dst"],
    ["DL", "bg-pos-dst"],
    ["LB", "bg-pos-dst"],
    ["DB", "bg-pos-dst"],
  ] as const)("%s is a filled pill with pos-ink", (pos, fill) => {
    render(<PositionPill position={pos} />);
    const el = screen.getByLabelText(pos);
    expect(el.className).toContain(fill);
    expect(el.className).toContain("text-pos-ink");
    expect(el.className).not.toContain("-tint");
  });
});
