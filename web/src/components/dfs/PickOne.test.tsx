import { fireEvent, render, screen } from "@testing-library/react";
import { PickOne } from "./PickOne";
import type { PickCtx } from "@/lib/dfs/pick-one";
import type { DfsLineup } from "@/lib/types";

const SAMPLE: DfsLineup = {
  lineup_id: "34",
  salary_used: 50000,
  stack: "DET 3",
  proj_fpts: 116.9,
  sim_win_pct: 0.31,
  sim_roi: 0.12,
  players: [
    { slot: "QB", name: "Jared Goff", dk_id: "1" },
    { slot: "RB", name: "Jahmyr Gibbs", dk_id: "2" },
    { slot: "RB2", name: "David Montgomery", dk_id: "3" },
    { slot: "WR", name: "Amon-Ra St. Brown", dk_id: "4" },
    { slot: "WR2", name: "Jameson Williams", dk_id: "5" },
    { slot: "WR3", name: "Chris Olave", dk_id: "6" },
    { slot: "TE", name: "Sam LaPorta", dk_id: "7" },
    { slot: "FLEX", name: "Bijan Robinson", dk_id: "8" },
    { slot: "DST", name: "Lions", dk_id: "9" },
  ],
};

const TEAMS = {
  "jared goff": "DET",
  "jahmyr gibbs": "DET",
  "david montgomery": "DET",
  "amon-ra st. brown": "DET",
  "jameson williams": "DET",
  "chris olave": "NO",
  "sam laporta": "DET",
  "bijan robinson": "ATL",
  lions: "DET",
};

const POSITIONS = {
  "jared goff": "QB",
  "jahmyr gibbs": "RB",
  "david montgomery": "RB",
  "amon-ra st. brown": "WR",
  "jameson williams": "WR",
  "chris olave": "WR",
  "sam laporta": "TE",
  "bijan robinson": "RB",
  lions: "DST",
};

const CTX: PickCtx = {
  dkToPlayerId: {
    "1": "goff",
    "2": "gibbs",
    "3": "mont",
    "4": "arsb",
    "5": "jamo",
    "6": "olave",
    "7": "porta",
    "8": "bijan",
    "9": "det-dst",
  },
  teams: TEAMS,
  positions: POSITIONS,
  p10: {
    goff: 12,
    gibbs: 10,
    mont: 6,
    arsb: 11,
    jamo: 7,
    olave: 8,
    porta: 5,
    bijan: 9,
    "det-dst": 4,
  },
  ours: {
    goff: 18,
    gibbs: 16,
    mont: 10,
    arsb: 17,
    jamo: 12,
    olave: 13,
    porta: 9,
    bijan: 15,
    "det-dst": 7,
  },
  ownFieldSim: {
    goff: 0.2,
    gibbs: 0.15,
    mont: 0.05,
    arsb: 0.18,
    jamo: 0.08,
    olave: 0.1,
    porta: 0.07,
    bijan: 0.12,
    "det-dst": 0.04,
  },
  rts: {},
  overrides: {},
  staleDkIds: new Set(),
};

const RUN = "bda9aaf4-032b-4380-ab3a-6634696525eb";

function renderPick(lineups: DfsLineup[] = [SAMPLE], ctx: PickCtx = CTX) {
  return render(
    <PickOne
      lineups={lineups}
      ctx={ctx}
      runId={RUN}
      slateId="2026_01_main"
      teams={TEAMS}
      positions={POSITIONS}
      slate="main"
    />,
  );
}

describe("PickOne", () => {
  it("hides win% and ROI in Cash and shows an em dash for RTS", () => {
    renderPick();
    expect(screen.getByRole("heading", { name: "Pick one" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cash" })).toBeInTheDocument();
    expect(screen.queryByText("Win %")).not.toBeInTheDocument();
    expect(screen.queryByText("31%")).not.toBeInTheDocument();
    expect(screen.queryByText("ROI")).not.toBeInTheDocument();
    expect(screen.queryByText("Field ownership")).not.toBeInTheDocument();
    expect(screen.getByText("RTS").parentElement).toHaveTextContent("—");
  });

  it("shows field ownership and sim stats in Tournament", () => {
    renderPick();
    fireEvent.click(screen.getByRole("button", { name: "Tournament" }));
    expect(screen.getByText("Win %")).toBeInTheDocument();
    expect(screen.getByText("31%")).toBeInTheDocument();
    expect(screen.getByText("Field ownership")).toBeInTheDocument();
    expect(screen.getByText("99.0%")).toBeInTheDocument();
  });

  it("names the one-row export single and starts with the DK header", async () => {
    const created: HTMLAnchorElement[] = [];
    const orig = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string, options?: ElementCreationOptions) => {
      const el = orig(tag, options);
      if (tag === "a") created.push(el as HTMLAnchorElement);
      return el;
    });
    const blobs: Blob[] = [];
    vi.stubGlobal("URL", {
      createObjectURL: (b: Blob) => {
        blobs.push(b);
        return "blob:pick-one";
      },
      revokeObjectURL: vi.fn(),
    });

    renderPick();
    fireEvent.click(screen.getByRole("button", { name: "Export this lineup" }));

    expect(created[0]?.download).toBe("dk_upload_2026_01_main_bda9aaf4_single.csv");
    const text = await blobs[0]!.text();
    expect(text.startsWith("QB,RB,RB,WR,WR,WR,TE,FLEX,DST\n")).toBe(true);
    expect(text.startsWith("#")).toBe(false);
  });

  it("lists a plain-language reason when a screen removes every lineup", () => {
    renderPick([{ ...SAMPLE, salary_used: 48000 }]);
    expect(screen.getByText("No lineup survived the screens.")).toBeInTheDocument();
    expect(screen.getByText("Leaves more than 1,500 unused")).toBeInTheDocument();
  });
});
