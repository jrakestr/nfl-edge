import { render } from "@testing-library/react";
import { GapTrack, LINE_SPAN } from "./GapTrack";

function track(el: HTMLElement) {
  return el.querySelector("[data-gap-track]") as HTMLElement;
}

describe("GapTrack", () => {
  it("a 9-point spread gap is 18× a 0.5-point gap on the shared ±14 domain", () => {
    const wide = render(<GapTrack kind="line" model={-4.5} market={4.5} />);
    const narrow = render(<GapTrack kind="line" model={0} market={0.5} />);
    const w = Number(track(wide.container).dataset.fillRatio);
    const n = Number(track(narrow.container).dataset.fillRatio);
    expect(w).toBeCloseTo(9 / LINE_SPAN, 4);
    expect(n).toBeCloseTo(0.5 / LINE_SPAN, 4);
    expect(w / n).toBeCloseTo(18, 5);
  });

  it("a +20 line clamps to the +14 end", () => {
    const { container } = render(<GapTrack kind="line" model={20} market={10} />);
    const el = track(container);
    expect(el.dataset.clamped).toBe("1");
    expect(Number(el.dataset.modelPos)).toBeCloseTo(1, 4);
    expect(Number(el.dataset.marketPos)).toBeCloseTo((10 - -14) / LINE_SPAN, 4);
  });

  it("marks model left of book when our home line is smaller", () => {
    const { container } = render(<GapTrack kind="line" model={-7} market={-3} />);
    const el = track(container);
    expect(Number(el.dataset.modelPos)).toBeLessThan(Number(el.dataset.marketPos));
    expect(el.querySelector('[data-mark="model"]')).toBeTruthy();
    expect(el.querySelector('[data-mark="market"]')).toBeTruthy();
  });

  it("fill sign follows the edge, not the raw gap", () => {
    const { container } = render(<GapTrack kind="line" model={3} market={-3} edge={0.12} />);
    expect(track(container).dataset.edge).toBe("pos");
    const neg = render(<GapTrack kind="prob" model={0.3} market={0.5} edge={-0.04} />);
    expect(track(neg.container).dataset.edge).toBe("neg");
  });

  it("empty when a value is null", () => {
    const { container } = render(<GapTrack kind="line" model={null} market={-3} />);
    const el = track(container);
    expect(el).toHaveAttribute("data-empty");
    expect(el.querySelector("[data-gap-fill]")).toBeNull();
  });

  it("aria-label includes both numbers", () => {
    const { container } = render(<GapTrack kind="prob" model={0.74} market={0.5} />);
    expect(track(container)).toHaveAttribute("aria-label", "Our 74%, book 50%");
  });
});
