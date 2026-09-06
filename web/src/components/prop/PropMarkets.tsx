"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const MARKETS = [
  { id: "rush_yds", label: "Rush yds" },
  { id: "rec_yds", label: "Rec yds" },
  { id: "rush_rec", label: "Rush + Rec" },
  { id: "rec", label: "Receptions" },
  { id: "anytime_td", label: "Anytime TD" },
] as const;

export const WINDOWS = ["L5", "L10", "L20", "season", "H2H"] as const;

/** Market tabs and L5/L10 segment. Inert in v1 — props arrive with Step 6. */
export function PropMarkets() {
  return (
    <div className="flex flex-col gap-3">
      <Tabs defaultValue="rush_yds">
        <TabsList variant="line" className="h-8">
          {MARKETS.map((m) => (
            <TabsTrigger key={m.id} value={m.id} className="t-body px-2">
              {m.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <ToggleGroup type="single" defaultValue="L10" size="sm" spacing={0} className="w-fit">
        {WINDOWS.map((w) => (
          <ToggleGroupItem key={w} value={w} className="t-caption h-7 px-2">
            {w}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
