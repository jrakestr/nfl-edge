import { fireEvent, render, screen } from "@testing-library/react";
import { DataTable } from "@/components/ui/DataTable";
import { PlayersList } from "@/components/players/PlayersList";
import { PRESERVED_PARAMS, parseTableState, tableStateToParams } from "@/lib/table-state";
import type { WeekPlayer } from "@/lib/types";

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace, prefetch: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/players",
  useSearchParams: () => new URLSearchParams("view=table&run=abc&season=2026&min=3&flat=0&slot=late"),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const PLAYERS: WeekPlayer[] = [
  {
    player_id: "a",
    display_name: "Jahmyr Gibbs",
    position: "RB",
    team: "DET",
    game_id: "g1",
    fpts_dk_mean: 18.2,
    typical_dk: 22,
    hist: null,
  },
  {
    player_id: "b",
    display_name: "Chris Olave",
    position: "WR",
    team: "NO",
    game_id: "g1",
    fpts_dk_mean: 12.1,
    typical_dk: 14,
    hist: null,
  },
];

describe("table-state", () => {
  it("does not clobber board keys when writing sort", () => {
    const base = new URLSearchParams(
      "view=table&run=abc&season=2026&min=3&flat=0&slot=late&lock=111&excl=222&stack=333",
    );
    const next = tableStateToParams({ ...parseTableState(base), sort: "proj", dir: "asc", q: "gibbs" }, base);
    for (const k of PRESERVED_PARAMS) {
      expect(next.get(k)).toBe(base.get(k));
    }
    expect(next.get("sort")).toBe("proj");
    expect(next.get("dir")).toBe("asc");
    expect(next.get("q")).toBe("gibbs");
  });
});

describe("DataTable", () => {
  it("sort click writes sort to the URL", () => {
    replace.mockClear();
    render(<PlayersList players={PLAYERS} />);
    fireEvent.click(screen.getByRole("button", { name: /player/i }));
    expect(replace).toHaveBeenCalled();
    const href = String(replace.mock.calls.at(-1)?.[0]);
    expect(href).toContain("sort=player");
    expect(href).toContain("view=table");
    expect(href).toContain("run=abc");
    expect(href).toContain("min=3");
  });

  it("search filter hides rows", () => {
    render(<PlayersList players={PLAYERS} />);
    expect(screen.getByText("Jahmyr Gibbs")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("Name or team"), { target: { value: "zzz" } });
    expect(screen.getByText("No projections listed yet")).toBeInTheDocument();
    expect(screen.queryByText("Jahmyr Gibbs")).not.toBeInTheDocument();
  });

  it("renders sort indicators on headers", () => {
    const { container } = render(
      <DataTable
        data={[{ id: "1", name: "A" }]}
        getRowId={(r) => r.id}
        empty="none"
        ariaLabel="Demo"
        columns={[{ id: "name", header: "Name", sortValue: (r) => r.name, cell: (r) => r.name }]}
      />,
    );
    expect(container.querySelector("svg")).toBeTruthy();
  });
});
