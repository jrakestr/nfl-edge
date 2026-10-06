"use client";

import { useRouter } from "next/navigation";
import { useLiveSearchParams } from "@/components/shell/GamesSelection";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { slateHref, slateLabel, type SlatePage } from "@/lib/slate";

export function SlateSelector({
  week,
  site,
  page,
  slate,
  slates,
}: {
  week: number | string;
  site: string;
  page: SlatePage;
  slate: string;
  slates: string[];
}) {
  const router = useRouter();
  const search = useLiveSearchParams();
  const options = slates;
  return (
    <Select
      value={slate}
      onValueChange={(next) => {
        if (!next || next === slate) return;
        router.push(slateHref({ page, week, site, slate: next, search }));
      }}
    >
      <SelectTrigger aria-label="Slate" className="h-8 rounded-md t-body font-semibold">
        <SelectValue>{slateLabel(slate)}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((id) => (
          <SelectItem key={id} value={id}>
            {slateLabel(id)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
