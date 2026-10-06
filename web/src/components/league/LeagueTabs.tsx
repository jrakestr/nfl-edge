"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { leagueHref, parseSeason } from "@/lib/league";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/league", label: "Standings", match: /^\/league\/?$/ },
  { href: "/league/weeks", label: "Season", match: /^\/league\/weeks/ },
  { href: "/league/week", label: "Matchups", match: /^\/league\/week(\/|$)/ },
  { href: "/league/acquire", label: "Acquire", match: /^\/league\/acquire/ },
  { href: "/league/wire", label: "Wire", match: /^\/league\/wire/ },
  { href: "/league/transactions", label: "Transactions", match: /^\/league\/transactions/ },
] as const;

function Tabs() {
  const pathname = usePathname() ?? "/league";
  const sp = useSearchParams();
  const season = parseSeason(sp.get("season") ?? undefined);
  return (
    <nav aria-label="League sections" className="flex flex-wrap items-center gap-1 border-b border-border">
      {TABS.map((t) => {
        const active = t.match.test(pathname);
        return (
          <Link
            key={t.label}
            href={leagueHref(t.href, season)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex h-9 items-center border-b-2 px-3 t-body",
              active
                ? "border-foreground font-semibold text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Link tab strip for /league. Nothing here reads the NFL week, slate, or game strip. */
export function LeagueTabs() {
  return (
    <Suspense>
      <Tabs />
    </Suspense>
  );
}
