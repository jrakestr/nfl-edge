// Pull per-player ownership and FPTS for finished DraftKings contests from the gamecenter API.
// DK deletes the standings CSV export after ~30 days; this API keeps working.
//
// Use: log in at draftkings.com, open DevTools console on any draftkings.com page, paste this
// file, then run   dkOwnership([195661349, 195921959])   with the contest keys you want
// (raw.dk_entry_history.contest_key). One JSON file downloads per contest:
// dk-ownership-<contest_key>.json. Load them with
//   uv run nfl-edge ingest dk-ownership ~/Downloads/dk-ownership-*.json
//
// What it reads: the leaderboard (top ~500 entries plus yours) and each entry's roster. Every
// roster row carries DK's contest-wide percentDrafted for that player, so ~500 rosters cover
// every player anyone meaningfully drafted. The full field is not available, so no top-1% line.
async function dkOwnership(contestKeys, concurrency = 8) {
  const get = async (url) => {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  };
  for (const ck of contestKeys) {
    const lb = await get(`https://api.draftkings.com/scores/v1/leaderboards/${ck}?format=json&embed=leaderboard`);
    const ents = lb.leaderBoard || [];
    if (!ents.length) { console.warn(`${ck}: empty leaderboard`); continue; }
    const dg = ents[0].draftGroupId;
    const players = {};
    const rows = [];
    let fails = 0;
    const work = ents.slice();
    const worker = async () => {
      while (work.length) {
        const e = work.shift();
        try {
          const j = await get(`https://api.draftkings.com/scores/v2/entries/${dg}/${e.entryKey}?format=json&embed=roster`);
          const sc = j.entries[0].roster.scorecards;
          const parts = sc.map((c) => [c.rosterPosition, c.displayName]).sort((a, b) => a[0].localeCompare(b[0]));
          rows.push({
            rank: e.rank,
            entryKey: e.entryKey,
            user: e.userName + (e.userEntryCount > 1 ? ` (${e.userEntryIndex}/${e.userEntryCount})` : ""),
            pts: e.fantasyPoints,
            lineup: parts.map((p) => p[0] + " " + p[1]).join(" "),
          });
          for (const c of sc) {
            players[c.displayName + "|" + c.rosterPosition] = {
              name: c.displayName, pos: c.rosterPosition, own: c.percentDrafted, fpts: c.score,
            };
          }
        } catch (err) { fails++; }
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    const out = {
      ck: String(ck), dg, entries: ents.length, rows, players: Object.values(players), fails,
      cash: lb.lastWinningEntry ? lb.lastWinningEntry.fantasyPoints : null,
      pulled_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(out)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `dk-ownership-${ck}.json`;
    a.click();
    console.log(`${ck}: ${rows.length} rosters, ${out.players.length} player rows, ${fails} failures`);
  }
}
