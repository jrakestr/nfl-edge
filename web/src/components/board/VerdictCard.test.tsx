import { render, screen, within } from "@testing-library/react";
import { VerdictCard } from "./VerdictCard";
import { asFailed, asMoved, asNoLine, fixturePayloads } from "@/test/fixture";

const payloads = fixturePayloads();
const ok = payloads.find((p) => p.status === "ok" && p.chips?.side && p.chips.total)!;
const warn = payloads.find((p) => p.status === "warn")!;

describe("VerdictCard", () => {
  it("renders the persisted sentences verbatim with the chips", () => {
    render(<VerdictCard payload={ok} />);
    const card = screen.getByRole("article");
    expect(card).toHaveAttribute("data-status", "ok");
    for (const s of ok.sentences) expect(card).toHaveTextContent(s.replace(/\s+/g, " "));
    const chips = within(card).getByRole("complementary", { name: "Chips" });
    expect(within(chips).getByText(ok.chips!.side!.label!)).toBeInTheDocument();
    expect(within(chips).getByText(ok.chips!.total!.label!)).toBeInTheDocument();
    expect(card.querySelector('[data-chip="Side"]')).toHaveAttribute("data-edge", ok.chips!.side!.edge >= 0.01 ? "pos" : ok.chips!.side!.edge <= -0.01 ? "neg" : "flat");
  });

  it("bolds the key numbers rather than regenerating grammar", () => {
    render(<VerdictCard payload={ok} />);
    const strong = screen.getByRole("article").querySelectorAll("strong, b");
    expect(strong.length).toBeGreaterThan(0);
    const text = Array.from(strong).map((n) => n.textContent).join(" ");
    expect(text).toMatch(/\d/);
  });

  it("fail: shows the withheld banner, one sentence, and no chips", () => {
    render(<VerdictCard payload={asFailed(ok)} failedChecks={["td_sum"]} />);
    const card = screen.getByRole("article");
    expect(card).toHaveAttribute("data-status", "fail");
    expect(within(card).getAllByText(/edges withheld/i).length).toBeGreaterThanOrEqual(1);
    expect(within(card).queryByRole("complementary", { name: "Chips" })).toBeNull();
    expect(within(card).getByRole("status")).toHaveAttribute("data-status", "fail");
  });

  it("no line: mutes the sentence, shows the fair numbers, no chips", () => {
    render(<VerdictCard payload={asNoLine(ok)} />);
    const card = screen.getByRole("article");
    expect(within(card).getByText(/No line posted yet · fair/)).toBeInTheDocument();
    expect(within(card).queryByRole("complementary", { name: "Chips" })).toBeNull();
    expect(card).not.toHaveTextContent(/withheld/);
  });

  it("warn: the status dot names the failing checks", () => {
    render(<VerdictCard payload={warn} failedChecks={["market_gap"]} />);
    const status = within(screen.getByRole("article")).getByRole("status");
    expect(status).toHaveAttribute("data-status", "warn");
    expect(status.getAttribute("aria-label")).toMatch(/market_gap/);
  });

  it("line moved since sim: notes the move in the header", () => {
    render(<VerdictCard payload={asMoved(ok)} />);
    expect(screen.getByText(/moved since sim: spread/)).toBeInTheDocument();
  });

  it("details button calls onOpen with the game id", () => {
    const onOpen = vi.fn();
    render(<VerdictCard payload={ok} onOpen={onOpen} />);
    screen.getByRole("button", { name: "details" }).click();
    expect(onOpen).toHaveBeenCalledWith(ok.game_id);
  });
});
