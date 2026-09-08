import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppShell } from "@/components/shell/AppShell";
import { SIDEBAR_COLLAPSED_KEY } from "@/lib/config";

describe("AppShell sidebar", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("collapse writes localStorage", () => {
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    expect(document.querySelector("[data-sidebar-collapsed]")).toHaveAttribute(
      "data-sidebar-collapsed",
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe("1");
    expect(document.querySelector("[data-sidebar-collapsed]")).toHaveAttribute(
      "data-sidebar-collapsed",
      "true",
    );
  });

  it("applies stored collapse after mount", async () => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, "1");
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
    });
  });

  it("nav includes Players and Optimize", () => {
    render(
      <AppShell>
        <div>content</div>
      </AppShell>,
    );
    expect(screen.getByRole("link", { name: "Players" })).toHaveAttribute("href", "/players");
    expect(screen.getByRole("link", { name: "Optimize" })).toHaveAttribute("href", "/optimize");
  });
});
