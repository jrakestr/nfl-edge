import { render, screen } from "@testing-library/react";
import { TeamLogo } from "./TeamLogo";

describe("TeamLogo", () => {
  it("shows a decorative mark and the abbreviation", () => {
    const { container } = render(<TeamLogo team="DET" />);
    expect(screen.getByText("DET")).toBeInTheDocument();
    expect(screen.queryByAltText("DET")).not.toBeInTheDocument();
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "/logos/DET.png");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("aria-hidden", "true");
    expect(img).toHaveAttribute("width", "18");
    expect(img).toHaveAttribute("height", "18");
  });

  it("keeps the displayed abbr and maps DK spelling only for the file", () => {
    const { container } = render(<TeamLogo team="LAR" />);
    expect(screen.getByText("LAR")).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("src", "/logos/LA.png");
  });

  it("falls back to the text abbreviation when the team is unknown", () => {
    const { container } = render(<TeamLogo team="FA" />);
    expect(screen.getByText("FA")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders an em dash when the team is empty", () => {
    const { container } = render(<TeamLogo team="" />);
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });
});
