import { render, screen } from "@testing-library/react";
import { TopBar } from "@/components/shell/TopBar";
import { PageActionsProvider } from "@/components/shell/PageActions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/week/1/dfs/dk/main",
  useSearchParams: () => new URLSearchParams(),
}));

describe("TopBar breadcrumbs", () => {
  it("renders Week 1 › Lineups › DK Main for the DK main slate", () => {
    render(
      <PageActionsProvider>
        <TopBar />
      </PageActionsProvider>,
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(nav.textContent?.replace(/\s+/g, " ")).toMatch(/Week 1\s*›\s*Lineups\s*›\s*DK Main/);
    expect(screen.getByRole("link", { name: "Week 1" })).toHaveAttribute("href", "/week/1");
    expect(screen.getByText("DK Main")).not.toHaveAttribute("href");
    expect(screen.getByText("DK Main")).toHaveClass("font-semibold");
  });
});
