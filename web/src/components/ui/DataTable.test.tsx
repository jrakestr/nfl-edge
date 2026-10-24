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

  it("resizes a column when dragging the column resizer and resets on double-click", () => {
    render(
      <DataTable
        data={[{ id: "1", name: "Alpha" }]}
        getRowId={(r) => r.id}
        empty="none"
        ariaLabel="ResizeDemo"
        columns={[{ id: "name", header: "Name", sortValue: (r) => r.name, cell: (r) => r.name }]}
      />,
    );
    const th = screen.getByRole("columnheader", { name: /Name/i });
    vi.spyOn(th, "getBoundingClientRect").mockReturnValue({
      width: 120,
      height: 40,
      top: 0,
      left: 0,
      bottom: 40,
      right: 120,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const resizer = th.querySelector('[data-slot="column-resizer"]')!;
    expect(resizer).toBeTruthy();

    fireEvent.pointerDown(resizer, { clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 180 });
    fireEvent.pointerUp(window);

    expect(th).toHaveStyle({ width: "200px" });

    // Clamps to minimum width (48px)
    fireEvent.pointerDown(resizer, { clientX: 200 });
    fireEvent.pointerMove(window, { clientX: 10 });
    fireEvent.pointerUp(window);
    expect(th).toHaveStyle({ width: "48px" });

    // Double-click resets width
    fireEvent.doubleClick(resizer);
    expect(th.style.width).toBe("");
  });

  it("syncs stickyHeader column widths when resizing", () => {
    const { container } = render(
      <DataTable
        stickyHeader
        data={[{ id: "1", name: "Alpha" }]}
        getRowId={(r) => r.id}
        empty="none"
        ariaLabel="StickyResizeDemo"
        columns={[{ id: "name", header: "Name", sortValue: (r) => r.name, cell: (r) => r.name }]}
      />,
    );
    const stickyHead = container.querySelector('[data-slot="sticky-head"] th') as HTMLElement;
    expect(stickyHead).toBeTruthy();
    vi.spyOn(stickyHead, "getBoundingClientRect").mockReturnValue({
      width: 100,
      height: 40,
      top: 0,
      left: 0,
      bottom: 40,
      right: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    const resizer = stickyHead.querySelector('[data-slot="column-resizer"]')!;
    fireEvent.pointerDown(resizer, { clientX: 100 });
    fireEvent.pointerMove(window, { clientX: 160 });
    fireEvent.pointerUp(window);

    const bodyCell = container.querySelector("tbody td") as HTMLElement;
    expect(stickyHead).toHaveStyle({ width: "160px" });
    expect(bodyCell).toHaveStyle({ width: "160px" });
  });

  it("renders multi-tier category header groups and active-sort column tinting", () => {
    const { container } = render(
      <DataTable
        syncUrl={false}
        defaultSort={{ id: "passYds", dir: "desc" }}
        data={[
          { id: "1", name: "Alpha", passYds: 250, rushYds: 20 },
          { id: "2", name: "Beta", passYds: 190, rushYds: 45 },
        ]}
        getRowId={(r) => r.id}
        empty="none"
        ariaLabel="GroupedDemo"
        columns={[
          { id: "name", header: "Player", sortValue: (r) => r.name, cell: (r) => r.name },
          { id: "passYds", header: "Pass Yds", group: "PASSING", align: "right", sortValue: (r) => r.passYds, cell: (r) => r.passYds },
          { id: "rushYds", header: "Rush Yds", group: "RUSHING", align: "right", sortValue: (r) => r.rushYds, cell: (r) => r.rushYds },
        ]}
      />,
    );
    expect(screen.getByText("PASSING")).toBeInTheDocument();
    expect(screen.getByText("RUSHING")).toBeInTheDocument();
    const sortedHeader = container.querySelector('th[data-col-id="passYds"]');
    expect(sortedHeader).toHaveAttribute("data-active-sort", "desc");
    const sortedCells = container.querySelectorAll('td[data-active-sort="desc"]');
    expect(sortedCells.length).toBe(2);
  });
});
