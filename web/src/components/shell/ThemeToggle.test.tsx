import { fireEvent, render, screen } from "@testing-library/react";
import { THEME_BOOT, THEME_KEY } from "@/lib/config";
import { ThemeToggle } from "./ThemeToggle";

describe("ThemeToggle", () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("boot script writes data-theme only for a stored light or dark choice", () => {
    expect(THEME_BOOT).toContain(THEME_KEY);
    expect(THEME_BOOT).toMatch(/data-theme/);
    expect(THEME_BOOT).toMatch(/light/);
    expect(THEME_BOOT).toMatch(/dark/);
  });

  it("cycles system → light → dark → system", () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole("button", { name: "Theme: system" });
    fireEvent.click(btn);
    expect(localStorage.getItem(THEME_KEY)).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(screen.getByRole("button", { name: "Theme: light" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Theme: light" }));
    expect(localStorage.getItem(THEME_KEY)).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    fireEvent.click(screen.getByRole("button", { name: "Theme: dark" }));
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(screen.getByRole("button", { name: "Theme: system" })).toBeInTheDocument();
  });
});
