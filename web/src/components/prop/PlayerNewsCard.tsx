import type { PlayerNewsItem } from "@/lib/types";
import { cn } from "@/lib/utils";

function categoryTone(cat: string): string {
  const lower = cat.toLowerCase();
  if (lower.includes("injury")) return "bg-edge-neg-tint text-edge-neg border-edge-neg/20";
  if (lower.includes("transaction") || lower.includes("breaking")) {
    return "bg-line-tint text-line border-line/20";
  }
  return "bg-surface-inset text-foreground border-border-soft";
}

function primaryCategory(categories: string[]): string {
  const preferred = categories.find((c) => {
    const l = c.toLowerCase();
    return l.includes("injury") || l.includes("transaction") || l.includes("breaking") || l.includes("rumor") || l.includes("recap");
  });
  return preferred ?? categories[0] ?? "News";
}

export function PlayerNewsCard({ news }: { news: PlayerNewsItem[] }) {
  return (
    <section
      className="card flex flex-col gap-4 p-4"
      data-slot="player-news"
      aria-label="FantasyPros news"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="t-body font-semibold text-foreground">FantasyPros news</h2>
          <p className="t-caption">
            This player only. Display. Does not change the projection.
          </p>
        </div>
        {news.length > 0 ? (
          <span className="t-caption tnum">{news.length} {news.length === 1 ? "item" : "items"}</span>
        ) : null}
      </div>

      {news.length === 0 ? (
        <p className="t-caption" role="status">
          No FantasyPros news stored for this player yet. Run{" "}
          <code>uv run nfl-edge ingest fantasypros-news</code> to refresh.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {news.map((item) => {
            const cat = primaryCategory(item.categories);
            return (
              <li
                key={item.news_id}
                className="flex flex-col gap-2 rounded-lg border border-border-soft bg-surface-inset p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "rounded border px-2 py-0.5 t-caption font-semibold",
                        categoryTone(cat),
                      )}
                    >
                      {cat}
                    </span>
                    <span className="t-caption tnum">{item.created_at}</span>
                  </div>
                  {item.link ? (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noreferrer"
                      className="t-caption font-semibold text-line hover:underline"
                    >
                      Source
                    </a>
                  ) : null}
                </div>
                <p className="t-body font-semibold text-foreground max-w-prose">
                  {item.title}
                </p>
                {item.description ? (
                  <p className="t-caption text-foreground max-w-prose">
                    {item.description}
                  </p>
                ) : null}
                {item.impact ? (
                  <p className="t-caption max-w-prose">
                    <span className="font-semibold text-foreground">Impact: </span>
                    {item.impact}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
