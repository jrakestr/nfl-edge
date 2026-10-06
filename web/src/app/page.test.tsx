import { redirect } from "next/navigation";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/queries/runs", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/queries/runs")>();
  return {
    ...orig,
    currentWeek: async () => 2,
    newestWeek: async () => 1,
    displayWeek: async () => orig.resolveDisplayWeek(2, 1),
  };
});

import Home from "@/app/page";

describe("Home", () => {
  it("redirects to week 2 given the current schedule state", async () => {
    await expect(Home()).rejects.toThrow("REDIRECT:/week/2");
    expect(redirect).toHaveBeenCalledWith("/week/2");
  });
});
