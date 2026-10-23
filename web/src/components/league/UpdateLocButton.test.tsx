import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UpdateLocButton } from "./UpdateLocButton";

const { updateLocStats, refresh } = vi.hoisted(() => ({
  updateLocStats: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/actions/loc", () => ({ updateLocStats }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn(), refresh }),
}));

describe("UpdateLocButton", () => {
  it("is labeled Update LOC stats and starts a pull for the season", async () => {
    updateLocStats.mockResolvedValue({ ok: true, message: "Updating LOC stats. This page refreshes when the pull finishes." });
    render(<UpdateLocButton season={2026} asOf="2026-10-18T00:47:00Z" />);
    fireEvent.click(screen.getByRole("button", { name: "Update LOC stats" }));
    await waitFor(() => expect(updateLocStats).toHaveBeenCalledWith(2026));
    expect(await screen.findByRole("status")).toHaveTextContent("Updating LOC stats");
    expect(screen.getByRole("button", { name: "Update LOC stats" })).toBeDisabled();
  });

  it("shows a refusal", async () => {
    updateLocStats.mockResolvedValue({ ok: false, error: "GITHUB_DISPATCH_TOKEN is not set on the server" });
    render(<UpdateLocButton season={2026} asOf={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Update LOC stats" }));
    expect(await screen.findByRole("status")).toHaveTextContent("GITHUB_DISPATCH_TOKEN is not set on the server");
  });
});
