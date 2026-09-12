"use client";

import type { ReactNode } from "react";
import { useGameOpen } from "./useGameOpen";

/** Click target that opens a game via `?game=` without lifting WeekBoard to the client. */
export function OpenGameTrigger({ gameId, children }: { gameId: string; children: ReactNode }) {
  const open = useGameOpen();
  return (
    <div className="cursor-pointer" data-open-game={gameId} onClick={() => open(gameId)}>
      {children}
    </div>
  );
}
