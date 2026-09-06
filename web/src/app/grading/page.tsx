import { EmptyState } from "@/components/EmptyState";

export const metadata = { title: "Grading" };

export default function Page() {
  return <EmptyState title="Grading">Graded picks, CLV and calibration from model.results. Fills in after the first graded week (step 7 is built; no games played yet).</EmptyState>;
}
