"use client";

import { formatFailedLine, type FailedCheckGroup } from "@/lib/queries/checks";
import { useGameOpen } from "./useGameOpen";

export function ChecksPanel({
  groups,
  runCreatedAt,
}: {
  groups: FailedCheckGroup[];
  runCreatedAt: string;
}) {
  const open = useGameOpen();
  if (groups.length === 0) return null;
  const failed = groups.filter((g) => g.severity === "invariant");
  const warnings = groups.filter((g) => g.severity !== "invariant");
  return (
    <section aria-label="Checks" className="card flex flex-col gap-3 p-4">
      {failed.length ? <CheckGroupList title="Failed" groups={failed} runCreatedAt={runCreatedAt} onOpen={open} /> : null}
      {warnings.length ? (
        <CheckGroupList title="Warnings" groups={warnings} runCreatedAt={runCreatedAt} onOpen={open} />
      ) : null}
    </section>
  );
}

function CheckGroupList({
  title,
  groups,
  runCreatedAt,
  onOpen,
}: {
  title: string;
  groups: FailedCheckGroup[];
  runCreatedAt: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="t-colhead text-muted-foreground">{title}</h3>
      {groups.map((g) => (
        <div key={g.check_name} className="flex flex-col gap-1">
          <p className="t-body font-semibold text-foreground">{g.check_name}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((item) => (
              <li key={`${item.game_id}-${item.row.team ?? ""}-${item.row.check_name}`}>
                <button
                  type="button"
                  className="t-body text-left text-foreground hover:underline"
                  onClick={() => onOpen(item.game_id)}
                >
                  {formatFailedLine(item.away, item.home, item.row, runCreatedAt)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
