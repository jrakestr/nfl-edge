import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CheckStatus } from "./CheckStatus";

describe("CheckStatus", () => {
  it("ok carries a DOM label", () => {
    render(<CheckStatus status="ok" />);
    expect(screen.getByRole("status", { name: /all invariants passed/i })).toBeInTheDocument();
  });
  it("warn carries a DOM label", () => {
    render(<CheckStatus status="warn" failed={["spread_gap_vs_market"]} />);
    expect(screen.getByRole("status", { name: /warnings present/i })).toBeInTheDocument();
  });
  it("fail carries a DOM label", () => {
    render(<CheckStatus status="fail" failed={["td_sum"]} />);
    expect(screen.getByRole("status", { name: /invariant failed/i })).toBeInTheDocument();
  });
});
