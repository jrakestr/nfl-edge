import { EmptyState } from "@/components/EmptyState";

export const metadata = { title: "Games" };

export default function Page() {
  return <EmptyState title="Games">One row per game with the score distribution from the draws. Fills in with the draws read path (web-refine).</EmptyState>;
}
