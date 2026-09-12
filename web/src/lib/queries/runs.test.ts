import { pickDefaultRun, pickLineupRun } from "./runs";

const t = (iso: string) => new Date(iso);

function run(id: string, created: string, n_games: number) {
  return { run_id: id, created_at: t(created), n_games };
}

const FULL = 16;
const olderFull = run("aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "2026-09-11T16:00:00Z", 16);
const newerPartial = run("bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbb2", "2026-09-13T16:00:00Z", 8);
const newestFull = run("ccccccc3-cccc-4ccc-8ccc-ccccccccccc3", "2026-09-13T18:00:00Z", 16);

describe("pickDefaultRun", () => {
  it("skips a newer partial run and keeps the newest full slate", () => {
    expect(pickDefaultRun([newerPartial, olderFull], FULL)?.run_id).toBe(olderFull.run_id);
  });

  it("uses the newest run when its proj_games count matches the week", () => {
    expect(pickDefaultRun([newestFull, newerPartial, olderFull], FULL)?.run_id).toBe(newestFull.run_id);
  });

  it("honors a pinned run even when that run is partial", () => {
    expect(pickDefaultRun([newerPartial, olderFull], FULL, newerPartial.run_id)?.run_id).toBe(
      newerPartial.run_id,
    );
  });

  it("falls back to the full-slate rule when the pin is missing", () => {
    expect(pickDefaultRun([newerPartial, olderFull], FULL, "deadbeef-dead-4ead-8ead-deadbeefdead")?.run_id).toBe(
      olderFull.run_id,
    );
  });

  it("falls back to newest when no run covers the slate", () => {
    expect(pickDefaultRun([newerPartial], FULL)?.run_id).toBe(newerPartial.run_id);
  });

  it("returns null when there are no runs", () => {
    expect(pickDefaultRun([], FULL)).toBeNull();
  });
});

function lu(id: string, created: string, n_games: number, n_lineups: number) {
  return { run_id: id, created_at: t(created), n_games, n_lineups };
}

const satLineups = lu("aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "2026-09-12T03:00:00Z", 16, 150);
const sunSimNoLu = lu("bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbb2", "2026-09-13T15:45:00Z", 16, 0);

describe("pickLineupRun", () => {
  it("keeps Saturday lineups while Sunday has a full sim and no lineups", () => {
    const picked = pickLineupRun([sunSimNoLu, satLineups], FULL);
    expect(picked?.run.run_id).toBe(satLineups.run_id);
    expect(picked?.buildInProgress).toBe(true);
  });

  it("uses the new run once it has lineups", () => {
    const sunDone = { ...sunSimNoLu, n_lineups: 150 };
    const picked = pickLineupRun([sunDone, satLineups], FULL);
    expect(picked?.run.run_id).toBe(sunDone.run_id);
    expect(picked?.buildInProgress).toBe(false);
  });

  it("returns the default run with no note when nothing has lineups", () => {
    const picked = pickLineupRun([sunSimNoLu], FULL);
    expect(picked?.run.run_id).toBe(sunSimNoLu.run_id);
    expect(picked?.buildInProgress).toBe(false);
  });
});
