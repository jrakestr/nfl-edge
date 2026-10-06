import { render, screen } from "@testing-library/react";
import { Matchup } from "./TeamDot";

describe("Matchup", () => {
  it("defaults to color dots, not logos", () => {
    const { container } = render(<Matchup home="DET" away="NO" />);
    expect(screen.getByText("DET")).toBeInTheDocument();
    expect(screen.getByText("NO")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelectorAll(".size-2")).toHaveLength(2);
  });

  it("logo variant shows decorative marks and keeps the abbreviations", () => {
    const { container } = render(<Matchup home="DET" away="NO" variant="logo" />);
    expect(screen.getByText("DET")).toBeInTheDocument();
    expect(screen.getByText("NO")).toBeInTheDocument();
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toHaveAttribute("src", "/logos/NO.png");
    expect(imgs[1]).toHaveAttribute("src", "/logos/DET.png");
    expect(imgs[0]).toHaveAttribute("alt", "");
    expect(container.querySelector(".size-2")).toBeNull();
  });

  it("shows both stored Elo ratings in the foreground, including zero", () => {
    render(<Matchup home="DET" away="NO" awayElo={0} homeElo={12.4} />);
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("12.4")).toBeInTheDocument();
  });

  it("uses an em dash when a side has no stored rating", () => {
    render(<Matchup home="DET" away="NO" awayElo={null} homeElo={3} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
