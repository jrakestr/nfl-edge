import { render, screen, within } from "@testing-library/react";
import { SHOW_COVER_SENTENCE, VerdictCard } from "./VerdictCard";
import { asFailed, asMoved, asNoLine, fixturePayloads, fixtureRows } from "@/test/fixture";
import { americanToProb } from "@/lib/line-grid";
import { pct } from "@/lib/edge";

const payloads = fixturePayloads();
const ok = payloads.find((p) => p.status === "ok" && p.chips?.side && p.chips.total)!;
const warn = payloads.find((p) => p.status === "warn")!;
const miaLv = payloads.find((p) => p.game_id === "2026_01_MIA_LV") ?? warn;

describe("VerdictCard", () => {
  it("renders three market rows with column headers and no chip aside", () => {
    render(<VerdictCard payload={ok} />);
    const card = screen.getByRole("article");
    expect(card).toHaveAttribute("data-status", "ok");
    expect(within(card).queryByRole("complementary", { name: "Chips" })).toBeNull();
    expect(card).toHaveTextContent("Pick");
    expect(card).toHaveTextContent("Ours");
    expect(card).toHaveTextContent("Book");
    expect(card).toHaveTextContent("Needs");
    expect(card.querySelector('[data-market="spread"]')).toBeTruthy();
    expect(card.querySelector('[data-market="total"]')).toBeTruthy();
    expect(card.querySelector('[data-market="moneyline"]')).toBeTruthy();
    expect(card).toHaveTextContent(ok.sentences[0]!.replace(/\s+/g, " "));
    expect(card).toHaveTextContent(ok.sentences[2]!.replace(/\s+/g, " "));
    if (SHOW_COVER_SENTENCE) {
      expect(card).toHaveTextContent(ok.sentences[1]!.replace(/\s+/g, " "));
    } else {
      expect(card).not.toHaveTextContent(ok.sentences[1]!.replace(/\s+/g, " "));
    }
  });

  it("Needs is americanToProb(price), not the de-vigged book", () => {
    const priced = {
      ...ok,
      chips: {
        ...ok.chips!,
        side: { ...ok.chips!.side!, price: -108, market_prob: 0.5 },
      },
    };
    render(<VerdictCard payload={priced} />);
    const spread = screen.getByRole("article").querySelector('[data-market="spread"]')!;
    expect(within(spread as HTMLElement).getByText("51.9%")).toBeInTheDocument();
    expect(pct(americanToProb(-108), 1)).toBe("51.9%");
    expect(within(spread as HTMLElement).queryByText("50.0%")).toBeNull();
  });

  it("bolds the key numbers rather than regenerating grammar", () => {
    render(<VerdictCard payload={ok} />);
    const strong = screen.getByRole("article").querySelectorAll("strong, b");
    expect(strong.length).toBeGreaterThan(0);
    expect(Array.from(strong).map((n) => n.textContent).join(" ")).toMatch(/\d/);
  });

  it("never says Home or HOME WINS; MIA/LV moneyline is MIA", () => {
    render(<VerdictCard payload={miaLv} />);
    const card = screen.getByRole("article");
    expect(card).not.toHaveTextContent("HOME WINS");
    expect(card).not.toHaveTextContent(/\bHome\b/);
    const ml = card.querySelector('[data-market="moneyline"]')!;
    expect(ml).toHaveTextContent("MIA");
    expect(ml).not.toHaveTextContent("LV");
  });

  it("renders an optional fourth sentence on the moneyline row", () => {
    const withMl = { ...ok, sentences: [...ok.sentences, "Indianapolis wins outright in 60% of our 20,000 simulated games; +145 pays at 39%."] };
    render(<VerdictCard payload={withMl} />);
    expect(screen.getByRole("article").querySelector('[data-market="moneyline"]')).toHaveTextContent(
      "Indianapolis wins outright",
    );
  });

  it("fail: shows the withheld banner, one sentence, and no market rows", () => {
    render(<VerdictCard payload={asFailed(ok)} failedChecks={["td_sum"]} />);
    const card = screen.getByRole("article");
    expect(card).toHaveAttribute("data-status", "fail");
    expect(within(card).getAllByText(/edges withheld/i).length).toBeGreaterThanOrEqual(1);
    expect(card.querySelector("[data-market]")).toBeNull();
    expect(within(card).getByRole("status")).toHaveAttribute("data-status", "fail");
  });

  it("no line: keeps the sentence on foreground, shows fair abbrs, no market rows", () => {
    render(<VerdictCard payload={asNoLine(ok)} />);
    const card = screen.getByRole("article");
    expect(within(card).getByText(/No line posted yet · fair/)).toBeInTheDocument();
    expect(card.querySelector("[data-market]")).toBeNull();
    expect(card).not.toHaveTextContent(/withheld/);
    expect(card).not.toHaveTextContent(/\bhome \d/i);
  });

  it("market-gap caption sits once in the header and keeps rows", () => {
    render(
      <VerdictCard
        payload={warn}
        failedChecks={["spread_gap_vs_market"]}
        gapCaptions={["spread 9.0 from market at run Sat 14:00 (limit 4.0)"]}
      />,
    );
    const card = screen.getByRole("article");
    const notes = within(card).getAllByText("spread 9.0 from market at run Sat 14:00 (limit 4.0)");
    expect(notes).toHaveLength(1);
    expect(notes[0]).toHaveClass("text-warn");
    expect(card.querySelector('[data-market="spread"]')).toBeTruthy();
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

  it("a started game drops the verdict rows", () => {
    const row = { ...fixtureRows()[0]!, game_id: ok.game_id, has_started: true, is_final: false };
    render(<VerdictCard payload={ok} row={row} />);
    const card = screen.getByRole("article");
    expect(screen.getByText("In progress")).toBeInTheDocument();
    for (const s of ok.sentences) expect(card).not.toHaveTextContent(s.replace(/\s+/g, " "));
    expect(card.querySelector("[data-market]")).toBeNull();
  });

  it("number columns do not use a middot or the dim color class", () => {
    const { container } = render(<VerdictCard payload={ok} />);
    const nums = container.querySelector('[data-market="spread"]')!;
    expect(nums.textContent).not.toContain("·");
    const dim = "text" + "-dim";
    expect([...nums.querySelectorAll("[class]")].some((el) => el.className.split(/\s+/).includes(dim))).toBe(false);
  });

  it("ledger header is a solid border underline; group rails; divider after the sentence", () => {
    const { container } = render(<VerdictCard payload={ok} />);
    const head = container.querySelector("[data-ledger-head]");
    expect(head).toBeTruthy();
    expect(head?.className.split(/\s+/)).toEqual(expect.arrayContaining(["border-b", "border-border"]));
    expect(head?.className).not.toMatch(/glass|sticky|backdrop/);
    const labels = [...(head?.querySelectorAll("span") ?? [])];
    expect(labels.map((el) => el.textContent)).toEqual(["Pick", "Ours", "Book", "Needs", "Gap", "Price", "Edge"]);
    expect(labels[1]?.className.split(/\s+/)).toEqual(expect.arrayContaining(["border-l", "border-border-soft"]));
    expect(labels[5]?.className.split(/\s+/)).toEqual(expect.arrayContaining(["border-l", "border-border-soft"]));
    for (const i of [0, 2, 3, 4, 6]) {
      expect(labels[i]?.className.split(/\s+/)).not.toContain("border-l");
    }

    const spread = container.querySelector('[data-market="spread"]')!;
    expect(spread.className.split(/\s+/)).toEqual(expect.arrayContaining(["border-b", "border-border"]));
    expect(spread.className.split(/\s+/)).not.toContain("border-t");
    expect(spread.className).not.toMatch(/bg-muted/);
    const sentence = spread.querySelector("[data-sentence]");
    expect(sentence).toBeTruthy();
    expect(sentence?.className.split(/\s+/)).toContain("pl-1");
    expect(sentence?.className.split(/\s+/)).toContain("t-sentence");
  });
});
