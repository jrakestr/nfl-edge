import { fireEvent, render, screen } from "@testing-library/react";
import { StackSuggestions } from "./StackSuggestions";
import type { WeekPlayer } from "@/lib/types";

function player(partial: Partial<WeekPlayer> & Pick<WeekPlayer, "player_id" | "display_name">): WeekPlayer {
  return {
    position: "WR",
    team: "KC",
    game_id: "g1",
    fpts_dk_mean: 12,
    fpts_dk_sd: 6,
    typical_dk: 10,
    hist: null,
    player_dk_id: partial.player_id,
    salary: 6000,
    value: 2,
    ...partial,
  };
}

const qb = player({
  player_id: "00-qb",
  player_dk_id: "dk-qb",
  display_name: "Patrick Mahomes",
  position: "QB",
  fpts_dk_mean: 22,
  fpts_dk_sd: 8,
  salary: 8000,
});
const wr = player({
  player_id: "00-wr",
  player_dk_id: "dk-wr",
  display_name: "Rashee Rice",
  fpts_dk_mean: 14,
  fpts_dk_sd: 8,
});
const dst = player({
  player_id: "LAC_DST",
  player_dk_id: "dk-dst",
  display_name: "Chargers",
  position: "DST",
  team: "LAC",
  fpts_dk_mean: 7,
  fpts_dk_sd: 4,
  salary: 3000,
});

const pairs = [
  { player_id_a: "00-qb", player_id_b: "00-wr", corr_dk: 0.4 },
  { player_id_a: "00-qb", player_id_b: "LAC_DST", corr_dk: -0.3 },
];

describe("StackSuggestions", () => {
  it("renders nothing without locks", () => {
    const { container } = render(
      <StackSuggestions players={[qb, wr]} pairs={pairs} locks={[]} excludes={[]} stack={[]} onAdd={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("Leverage")).not.toBeInTheDocument();
  });

  it("states the stack click is a requirement and names both lists", () => {
    render(
      <StackSuggestions
        players={[qb, wr, dst]}
        pairs={pairs}
        locks={["dk-qb"]}
        excludes={[]}
        stack={[]}
        onAdd={() => {}}
      />,
    );
    expect(screen.getByText(/Require in stack puts both players in every lineup/)).toBeInTheDocument();
    expect(screen.getByText(/additive to QB \+ n WR\/TE and bring-back/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Stack with" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Negatively correlated" })).toBeInTheDocument();
    expect(screen.getByText(/Game-script hedges/)).toBeInTheDocument();
    expect(screen.queryByText("Fade / do not pair")).not.toBeInTheDocument();
    expect(screen.queryByText("Leverage")).not.toBeInTheDocument();
  });

  it("writes the partner and the anchored lock", () => {
    const onAdd = vi.fn();
    render(
      <StackSuggestions
        players={[qb, wr, dst]}
        pairs={pairs}
        locks={["dk-qb"]}
        excludes={[]}
        stack={[]}
        onAdd={onAdd}
      />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: "Require in stack" })[0]!);
    expect(onAdd).toHaveBeenCalledWith("dk-wr", "dk-qb");
  });

  it("names the anchor when more than one player is locked", () => {
    const wr2 = player({
      player_id: "00-wr2",
      player_dk_id: "dk-wr2",
      display_name: "Xavier Worthy",
      fpts_dk_mean: 11,
      fpts_dk_sd: 7,
    });
    render(
      <StackSuggestions
        players={[qb, wr, wr2]}
        pairs={[{ player_id_a: "00-wr", player_id_b: "00-wr2", corr_dk: 0.3 }]}
        locks={["dk-qb", "dk-wr"]}
        excludes={[]}
        stack={[]}
        onAdd={() => {}}
      />,
    );
    expect(screen.getByText("vs Rashee Rice")).toBeInTheDocument();
  });
});
