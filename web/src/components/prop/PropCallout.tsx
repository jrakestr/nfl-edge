/** Tinted --line block under the player header. Empty until Step 6 writes model.prop_edges. */
export function PropCallout({ sentence }: { sentence?: string }) {
  return (
    <div className="rounded-md bg-line-tint px-3 py-2 t-sentence text-foreground" data-slot="prop-callout">
      {sentence ?? "We have no simulated line for this player yet."}
    </div>
  );
}
