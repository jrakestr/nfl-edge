import { render, screen } from "@testing-library/react";
import { navHref } from "@/lib/slate";
import { Sidebar } from "./Sidebar";

const loc = vi.hoisted(() => ({ pathname: "/week/1/players/dk/full" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => loc.pathname,
  useSearchParams: () => new URLSearchParams(),
}));

describe("Sidebar slate links", () => {
  it("Players stays newest Main; others keep the current slate", () => {
    render(<Sidebar collapsed={false} onToggle={() => {}} />);
    expect(screen.getByRole("link", { name: "Players" })).toHaveAttribute("href", "/players");
    expect(screen.getByRole("link", { name: "Games" })).toHaveAttribute("href", "/week/1/games?slate=full");
    expect(screen.getByRole("link", { name: "Lineups" })).toHaveAttribute("href", "/week/1/dfs/dk/full");
    expect(screen.getByRole("link", { name: "Optimize" })).toHaveAttribute("href", "/week/1/optimize/dk/full");
  });

  it("Slate review links to the current slate's review and is not confused with Lineups", () => {
    loc.pathname = "/week/5/dfs/dk/main/review";
    render(<Sidebar collapsed={false} onToggle={() => {}} />);
    expect(screen.getByRole("link", { name: "Slate review" })).toHaveAttribute("href", "/week/5/dfs/dk/main/review");
    expect(screen.getByRole("link", { name: "Slate review" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Lineups" })).not.toHaveAttribute("aria-current");
    loc.pathname = "/week/1/players/dk/full";
  });

  it("Research Lab is a plain /research link in the DFS group and is current on /research", () => {
    loc.pathname = "/research";
    render(<Sidebar collapsed={false} onToggle={() => {}} />);
    expect(screen.getByRole("link", { name: "Research Lab" })).toHaveAttribute("href", "/research");
    expect(screen.getByRole("link", { name: "Research Lab" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Players" })).not.toHaveAttribute("aria-current");
    loc.pathname = "/week/1/players/dk/full";
  });

  it("LOC league carries no week, slate, or games params", () => {
    render(<Sidebar collapsed={false} onToggle={() => {}} />);
    expect(screen.getByRole("link", { name: "LOC league" })).toHaveAttribute("href", "/league");
  });

  it("groups the links and marks the current page", () => {
    render(<Sidebar collapsed={false} onToggle={() => {}} />);
    expect(screen.getByText("Board")).toBeInTheDocument();
    expect(screen.getByText("DFS")).toBeInTheDocument();
    expect(screen.getByText("Grade")).toBeInTheDocument();
    expect(screen.getByText("League")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Players" })).toHaveAttribute("aria-current", "page");
  });

  it("LOC league stays a plain href even with slate and games in the live search", () => {
    const search = new URLSearchParams("slate=full&games=2026_04_KC_NE");
    expect(navHref("LOC league", { week: 1, site: "dk", slate: "full" }, "/league", search)).toBe("/league");
  });
});
