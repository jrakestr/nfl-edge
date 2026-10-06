import { LeagueTabs } from "@/components/league/LeagueTabs";

export const metadata = { title: "LOC league" };

/**
 * League of Champions is a season-long fantasy league, separate from the weekly NFL projections:
 * no week selector, slate, or game strip here. Sections are plain links.
 */
export default function LeagueLayout({ children }: LayoutProps<"/league">) {
  return (
    <div className="flex flex-col gap-4">
      <LeagueTabs />
      {children}
    </div>
  );
}
