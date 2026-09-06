/** Tinted --line block under a player header. Sentence comes from model.prop_edges. */
export function PropCallout({
  sentence,
  lean,
}: {
  sentence?: string | null;
  lean?: "over" | "under" | "flat" | null;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md bg-line-tint px-3 py-2" data-slot="prop-callout">
      <p className="t-sentence text-foreground">
        {sentence ?? "We have no simulated line for this player yet."}
      </p>
      {lean && lean !== "flat" ? (
        <span className="w-fit rounded-md bg-accent px-1.5 py-0.5 t-caption capitalize">
          Lean {lean}
        </span>
      ) : null}
    </div>
  );
}
