import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PlayerNewsCard } from "./PlayerNewsCard";
import type { PlayerNewsItem } from "@/lib/types";

const SAMPLE_ITEMS: PlayerNewsItem[] = [
  {
    news_id: 615566,
    player_id: "00-0038977",
    team: "HOU",
    created_at: "2026-10-23 21:29 UTC",
    title: "Tank Dell (knee) officially listed questionable for Sunday",
    description: "Tank Dell (knee) is officially listed as questionable to play in Sunday's game.",
    impact: "Dell is expected to suit up after practicing in limited fashion.",
    categories: ["Commentary", "News", "Injury"],
    author: "Leo Sells",
    link: "https://www.fantasypros.com/nfl/news/615566/tank-dell.php",
  },
];

describe("PlayerNewsCard", () => {
  it("renders player news items with category badge, timestamp, title, description, and impact", () => {
    render(<PlayerNewsCard news={SAMPLE_ITEMS} />);
    expect(screen.getByRole("region", { name: "FantasyPros news" })).toBeInTheDocument();
    expect(screen.getByText("Injury")).toBeInTheDocument();
    expect(screen.getByText("2026-10-23 21:29 UTC")).toBeInTheDocument();
    expect(
      screen.getByText("Tank Dell (knee) officially listed questionable for Sunday"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Dell is expected to suit up after practicing in limited fashion/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Source" })).toHaveAttribute(
      "href",
      "https://www.fantasypros.com/nfl/news/615566/tank-dell.php",
    );
  });

  it("renders an explicit empty state when no news is stored", () => {
    render(<PlayerNewsCard news={[]} />);
    expect(
      screen.getByText(/No FantasyPros news stored for this player yet/),
    ).toBeInTheDocument();
  });
});
