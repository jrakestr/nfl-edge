"use client";

import type { ReactNode } from "react";
import type { DrawerPlayer } from "@/lib/queries/players";
import type { TeamInput } from "@/lib/team-input";
import type { BoardRow, GameChecks, GameDetail, VerdictPayload } from "@/lib/types";
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
  detail = null,
  runCreatedAt,
  runId,
  teamInputs = {},
  scheduleOnly = false,
  children,
}: {
  openId: string | null;
  row: BoardRow | null;
  verdict: VerdictPayload | null;
  checks: GameChecks | null;
  players?: DrawerPlayer[];
  detail?: GameDetail | null;
  runCreatedAt?: string | null;
  runId?: string | null;
  teamInputs?: Record<string, TeamInput>;
  scheduleOnly?: boolean;
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
        detail={detail}
        runCreatedAt={runCreatedAt}
        runId={runId}
        teamInputs={teamInputs}
        scheduleOnly={scheduleOnly}
        open={openId != null && row != null}
        onOpenChange={(o) => {
          if (!o) setGame(null);
        }}
      />
    </>
  );
}
