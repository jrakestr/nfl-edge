import { fireEvent, render, screen } from "@testing-library/react";
import { MobileNav } from "./MobileNav";
import { SearchBox } from "./SearchBox";
import { Sidebar } from "./Sidebar";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/week/1/games",
  useSearchParams: () => new URLSearchParams(),
}));

describe("mobile shell", () => {
  it("menu button opens the same nav links and closes on navigate", () => {
    render(<MobileNav />);
    expect(screen.queryByRole("link", { name: "Players" })).toBeNull();
    const trigger = screen.getByRole("button", { name: "Open navigation" });
    expect(trigger.className).toContain("md:hidden");
    fireEvent.click(trigger);
    const link = screen.getByRole("link", { name: "Players" });
    expect(link).toHaveAttribute("href", "/players");
    expect(screen.getByRole("link", { name: "LOC league" })).toHaveAttribute("href", "/league");
    fireEvent.click(link);
    expect(screen.queryByRole("link", { name: "Players" })).toBeNull();
  });

  it("desktop sidebar is hidden under md", () => {
    render(<Sidebar collapsed={false} onToggle={() => {}} />);
    const aside = screen.getByRole("complementary", { name: "Primary" });
    expect(aside.className).toContain("hidden");
    expect(aside.className).toContain("md:flex");
  });

  it("search is an icon under md that reveals the field", () => {
    render(<SearchBox />);
    const input = screen.getByRole("searchbox", { name: "Search players" });
    expect(input.className).toContain("max-md:hidden");
    fireEvent.click(screen.getByRole("button", { name: "Open search" }));
    expect(input.className).not.toContain("max-md:hidden");
    expect(input.className).toContain("w-full");
  });
});
