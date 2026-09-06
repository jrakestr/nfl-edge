import { render } from "@testing-library/react";
import { EdgeCell } from "./EdgeCell";
import { direction, intensity, line, signed, signedPct } from "@/lib/edge";

function cell(props: Partial<React.ComponentProps<typeof EdgeCell>>) {
  const { container } = render(<EdgeCell model={-3} market={-3.5} kind="spread" edge={0.02} {...props} />);
  return container.firstElementChild as HTMLElement;
}

describe("intensity ramp", () => {
  it.each([
    [0, "flat", "flat"],
    [0.009, "flat", "flat"],
    [-0.009, "flat", "flat"],
    [0.01, "mid", "pos"],
    [0.0299, "mid", "pos"],
    [-0.02, "mid", "neg"],
    [0.03, "strong", "pos"],
    [-0.19, "strong", "neg"],
    [null, "flat", "flat"],
  ])("edge %s → %s / %s", (edge, inten, dir) => {
    expect(intensity(edge)).toBe(inten);
    expect(direction(edge)).toBe(dir);
  });

  it("stamps data-edge and data-intensity on the cell", () => {
    expect(cell({ edge: 0.005 }).dataset).toMatchObject({ edge: "flat", intensity: "flat" });
    expect(cell({ edge: 0.02 }).dataset).toMatchObject({ edge: "pos", intensity: "mid" });
    expect(cell({ edge: -0.05 }).dataset).toMatchObject({ edge: "neg", intensity: "strong" });
  });
});

describe("EdgeCell text", () => {
  it("spread: model · market · point gap, positive when the model likes the home side", () => {
    const el = cell({ model: -3, market: -3.5, kind: "spread", edge: 0.02 });
    expect(el).toHaveTextContent("−3·−3.5·−0.5");
  });

  it("total: positive gap means the model likes the over", () => {
    const el = cell({ model: 43, market: 40.5, kind: "total", edge: 0.05 });
    expect(el).toHaveTextContent("43.0·40.5·+2.5");
  });

  it("prob: percentages with a signed percentage gap", () => {
    const el = cell({ model: 0.409, market: 0.631, kind: "prob", edge: -0.22 });
    expect(el).toHaveTextContent("41%·63%·−22.2%");
  });

  it("missing model or market renders an em dash with no edge", () => {
    const el = cell({ market: null });
    expect(el).toHaveTextContent("—");
    expect(el.dataset.edge).toBe("none");
  });
});

describe("formatters", () => {
  it("line: PK for zero, no decimals on whole numbers", () => {
    expect(line(0)).toBe("PK");
    expect(line(-3)).toBe("−3");
    expect(line(3.5)).toBe("+3.5");
  });
  it("signed handles negative zero", () => {
    expect(signed(-0)).toBe("0.0");
    expect(signedPct(0.0512)).toBe("+5.1%");
  });
});
