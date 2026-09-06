import { EmptyState } from "@/components/EmptyState";

// Placeholder; the Edge board lands in web-edge-board.
export default async function WeekPage({ params }: PageProps<"/week/[n]">) {
  const { n } = await params;
  return (
    <EmptyState title={`Week ${n}`}>
      Edge board: week summary, verdicts and the model-vs-market table. Arrives with web-edge-board.
    </EmptyState>
  );
}
