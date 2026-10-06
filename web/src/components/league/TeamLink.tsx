import Link from "next/link";
import { isViewerTeam, leagueHref } from "@/lib/league";
import { cn } from "@/lib/utils";

export function TeamLink({
  id,
  name,
  season,
  className,
}: {
  id: number;
  name: string;
  season: number;
  className?: string;
}) {
  const yours = isViewerTeam(id);
  return (
    <Link
      href={leagueHref(`/league/team/${id}`, season)}
      title={yours ? "Your team" : undefined}
      data-yours={yours ? "true" : undefined}
      className={cn("font-semibold hover:underline", className, yours ? "text-line" : "text-foreground")}
    >
      {name}
    </Link>
  );
}
