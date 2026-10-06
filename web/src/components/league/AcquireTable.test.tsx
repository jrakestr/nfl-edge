import { fireEvent, render, screen } from "@testing-library/react";
import { AcquireTable } from "./AcquireTable";
import type { AcquireRow } from "@/lib/league";

vi.mock("next/navigation", () => ({
  usePathname: () => "/league/acquire",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

function row(over: Partial<AcquireRow>): AcquireRow {
  return {
    source: "roster",
    player: "A",
    position: "QB",
    nfl_team: "WAS",
    espn_team_id: 1,
    espn_player_id: null,
    team: "Alpha",
    slot: "QB",
    availability: null,
    status_at_pull: null,
    season_pts: 1.7,
    season_proj: 104.91,
    fp_rank: 16,
    games_played: 1,
    ...over,
  };
}

describe("AcquireTable pace", () => {
  it("shows the full-season percent and colors it by NFL games played", () => {
    render(
      <AcquireTable
        season={2026}
        seasonWeeks={14}
        rows={[
          row({ player: "Kirk Cousins", espn_team_id: 19, season_pts: 116.8, season_proj: 112.64, games_played: 4 }),
          row({ player: "Jaylen Wright", espn_team_id: 2, season_pts: 1.7, season_proj: 104.91, games_played: 3 }),
          row({ player: "Full Slate", espn_team_id: 3, season_pts: 2.1, season_proj: 104.91, games_played: 4 }),
          row({ player: "No Games", espn_team_id: 4, season_pts: 0, season_proj: 100, games_played: 0 }),
        ]}
      />,
    );
    const names = screen.getAllByRole("row").map((r) => r.textContent ?? "");
    const cousins = names.findIndex((t) => t.includes("Kirk Cousins"));
    const wright = names.findIndex((t) => t.includes("Jaylen Wright"));
    const full = names.findIndex((t) => t.includes("Full Slate"));
    expect(full).toBeLessThan(wright);
    expect(wright).toBeLessThan(cousins);
    const marks = [...document.querySelectorAll("[data-share]")].map((e) => ({
      text: e.textContent,
      level: e.getAttribute("data-share"),
    }));
    expect(marks).toEqual([
      { text: "2%", level: "high" },
      { text: "2%", level: "mid" },
      { text: "104%", level: "high" },
    ]);
    expect(screen.getByText("0%")).toBeInTheDocument();
    expect(screen.getByText("3 games")).toBeInTheDocument();
    expect(screen.getAllByText("4 games")).toHaveLength(2);
    expect(screen.getByText("0 games")).toBeInTheDocument();
    expect(screen.getByText("112.6")).toBeInTheDocument();
  });

  it("hides a season projection below the minimum", () => {
    render(
      <AcquireTable
        season={2026}
        seasonWeeks={14}
        rows={[
          row({ player: "Travis Hunter", espn_team_id: 2, season_pts: 2.1, season_proj: 0.74 }),
          row({ player: "Kirk Cousins", espn_team_id: 19, season_pts: 116.8, season_proj: 112.64 }),
          row({ player: "Blank", espn_team_id: 3, season_pts: 4, season_proj: null }),
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Min season proj"), { target: { value: "10" } });
    expect(screen.queryByText("Travis Hunter")).not.toBeInTheDocument();
    expect(screen.queryByText("Blank")).not.toBeInTheDocument();
    expect(screen.getByText("Kirk Cousins")).toBeInTheDocument();
  });

  it("filters to waivers and to a health status", () => {
    render(
      <AcquireTable
        season={2026}
        seasonWeeks={14}
        rows={[
          row({ player: "Kirk Cousins", espn_team_id: 19, status_at_pull: "ACTIVE" }),
          row({
            source: "wire",
            player: "Travis Hunter",
            espn_team_id: null,
            espn_player_id: 1,
            team: "Wire",
            availability: "WAIVERS",
            status_at_pull: "QUESTIONABLE",
          }),
          row({
            source: "wire",
            player: "Cam Little",
            espn_team_id: null,
            espn_player_id: 2,
            team: "Wire",
            availability: "FREEAGENT",
            status_at_pull: "ACTIVE",
          }),
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Pool"), { target: { value: "Waivers" } });
    expect(screen.getByText("Travis Hunter")).toBeInTheDocument();
    expect(screen.queryByText("Kirk Cousins")).not.toBeInTheDocument();
    expect(screen.queryByText("Cam Little")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Pool"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "Q" } });
    expect(screen.getByText("Travis Hunter")).toBeInTheDocument();
    expect(screen.queryByText("Kirk Cousins")).not.toBeInTheDocument();
    expect(screen.queryByText("Cam Little")).not.toBeInTheDocument();
  });
});
