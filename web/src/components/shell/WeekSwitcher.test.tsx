import { render, screen } from "@testing-library/react";
import { weekHref, weekSubpath, WeekSwitcher } from "./WeekSwitcher";

const loc = vi.hoisted(() => ({ pathname: "/week/5/dfs/dk/main/review" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => loc.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

describe("WeekSwitcher", () => {
  it("parses week sub-pages only", () => {
    expect(weekSubpath("/week/5/dfs/dk/main/review")).toEqual({ week: 5, rest: "dfs/dk/main/review" });
    expect(weekSubpath("/week/5")).toBeNull();
    expect(weekSubpath("/players")).toBeNull();
  });

  it("keeps the page and drops week-bound params", () => {
    const search = new URLSearchParams("run=abc&games=x&contest=9&view=table");
    expect(weekHref("dfs/dk/main/review", 4, search)).toBe("/week/4/dfs/dk/main/review?view=table");
  });

  it("renders on week sub-pages, not on the board", () => {
    loc.pathname = "/week/5/dfs/dk/main/review";
    const { unmount } = render(<WeekSwitcher />);
    expect(screen.getByRole("combobox", { name: "Week" })).toHaveTextContent("Week 5");
    unmount();
    loc.pathname = "/week/5";
    render(<WeekSwitcher />);
    expect(screen.queryByRole("combobox", { name: "Week" })).toBeNull();
  });
});
