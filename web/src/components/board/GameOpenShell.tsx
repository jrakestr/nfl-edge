"use client";

import type { ReactNode } from "react";
import type { DrawerPlayer } from "@/lib/queries/players";
import type { BoardRow, GameChecks, VerdictPayload } from "@/lib/types";
import { GameDrawer } from "./GameDrawer";
import { useGameOpen } from "./useGameOpen";

/**
 * Owns drawer open/close for one game. The server passes that game's props from `?game=`;
 * the rest of the board stays a server tree.
 */
export function GameOpenShell({
  openId,
  row,
  verdict,
  checks,
  players = [],
  runCreatedAt,
  children,
}: {
  openId: string | null;
  row: BoardRow | null;
  verdict: VerdictPayload | null;
  checks: GameChecks | null;
  players?: DrawerPlayer[];
  runCreatedAt?: string | null;
  children: ReactNode;
}) {
  const setGame = useGameOpen();
  return (
    <>
      {children}
      <GameDrawer
        row={row}
        verdict={verdict}
        checks={checks}
        players={players}
        runCreatedAt={runCreatedAt}
        open={openId != null && row != null}
        onOpenChange={(o) => {
          if (!o) setGame(null);
        }}
      />
    </>
  );
}
