import type { Metadata } from "next";
import { PropDetail } from "@/components/prop/PropDetail";
import { gameById, playerById } from "@/lib/queries/players";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/props/[game]/[player]">): Promise<Metadata> {
  const { player } = await params;
  return { title: player };
}

export default async function PropPage({ params }: PageProps<"/props/[game]/[player]">) {
  const { game, player } = await params;
  const [header, ctx] = await Promise.all([playerById(player), gameById(game)]);
  return <PropDetail player={header} game={ctx} playerId={player} />;
}
