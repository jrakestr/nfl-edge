import {
  asOfCaption,
  buildWeekGrid,
  espnStatusLabel,
  fpTiming,
  defaultTxnWeek,
  filterTransactions,
  groupTransactions,
  txnItemLines,
  weekMatchups,
  leagueHref,
  parseSeason,
  parseTeamId,
  paRanking,
  practiceLine,
  progressLabel,
  pointsTone,
  shareTone,
  recordLabel,
  availabilityLabel,
  acquirePaceSort,
  paceShareGap,
  paceGap,
  pointsRemaining,
  rosPprRank,
  seasonShare,
  slotLabel,
  transactionWeekTabs,
  sortAvailable,
  waiverSuggestions,
  weeksLeft,
  starterMisses,
  txnSummary,
  winsTone,
  MISS_POINTS,
  type AvailablePlayer,
  type LeagueTeamWeek,
  type StarterProj,
  type TxnGroup,
  type TxnRow,
  type StarterRow,
} from "@/lib/league";

function tw(over: Partial<LeagueTeamWeek>): LeagueTeamWeek {
  return {
    season: 2026,
    week: 1,
    espn_team_id: 1,
    team: "A",
    opp_espn_team_id: 2,
    opp_team: "B",
    is_final: true,
    proj_pts: 100,
    actual_pts: 110,
    opp_proj_pts: 100,
    opp_actual_pts: 90,
    own_pm: 10,
    opp_pm: -10,
    proj_margin: 0,
    actual_margin: 20,
    swing: 20,
    win: 1,
    week_rank: 1,
    league_avg: 100,
    league_sd: 20,
    sd_from_avg: 0.5,
    allplay_wins: 8,
    allplay_losses: 3,
    cum_pf: 110,
    cum_pf_rank: 1,
    pts_back_of_pf_leader: 0,
    cum_pa: 90,
    luck: null,
    ...over,
  };
}

describe("record and labels", () => {
  it("formats records with ties only when present", () => {
    expect(recordLabel(3, 1, 0)).toBe("3–1");
    expect(recordLabel(2, 1, 1)).toBe("2–1–1");
  });

  it("progress label names the open week, else the last final one", () => {
    expect(progressLabel([{ week: 1, is_final: true }, { week: 2, is_final: false }])).toBe("Week 2 in progress");
    expect(progressLabel([{ week: 1, is_final: true }, { week: 2, is_final: true }])).toBe("Final through week 2");
    expect(progressLabel([])).toBeNull();
  });

  it("builds hrefs that keep the season only when it is not the default", () => {
    expect(leagueHref("/league", 2026)).toBe("/league");
    expect(leagueHref("/league/luck", 2025)).toBe("/league/luck?season=2025");
    expect(leagueHref("/league/transactions", 2025, { team: "3" })).toBe(
      "/league/transactions?season=2025&team=3",
    );
    expect(leagueHref("/league/transactions", 2026, { team: "", type: "WAIVER" })).toBe(
      "/league/transactions?type=WAIVER",
    );
  });

  it("never carries games or slate params", () => {
    expect(leagueHref("/league", 2026, { games: "x", slate: "main" } as Record<string, string>)).not.toMatch(
      /games|slate/,
    );
  });

  it("parses season and team id defensively", () => {
    expect(parseSeason("2025")).toBe(2025);
    expect(parseSeason("abc")).toBe(2026);
    expect(parseSeason(undefined)).toBe(2026);
    expect(parseTeamId("19")).toBe(19);
    expect(parseTeamId("0")).toBeNull();
    expect(parseTeamId("x")).toBeNull();
  });
});

describe("tones", () => {
  it("points: flat under 5, mid under 15, strong above", () => {
    expect(pointsTone(2)).toEqual({ dir: "flat", inten: "flat" });
    expect(pointsTone(-10)).toEqual({ dir: "neg", inten: "mid" });
    expect(pointsTone(30)).toEqual({ dir: "pos", inten: "strong" });
    expect(pointsTone(null)).toEqual({ dir: "flat", inten: "flat" });
  });

  it("splits a percent-versus-pace into four steps", () => {
    expect(shareTone(-2)).toEqual({ dir: "flat", level: "flat" });
    expect(shareTone(-9.6)).toEqual({ dir: "neg", level: "low" });
    expect(shareTone(-17.3)).toEqual({ dir: "neg", level: "mid" });
    expect(shareTone(-28.6)).toEqual({ dir: "neg", level: "high" });
    expect(shareTone(16)).toEqual({ dir: "pos", level: "mid" });
  });

  it("wins: flat under 0.25, mid under 0.75, strong above", () => {
    expect(winsTone(0.1)).toEqual({ dir: "flat", inten: "flat" });
    expect(winsTone(-0.5)).toEqual({ dir: "neg", inten: "mid" });
    expect(winsTone(0.9)).toEqual({ dir: "pos", inten: "strong" });
  });
});

describe("status captions", () => {
  it("maps ESPN statuses to short labels, healthy to null", () => {
    expect(espnStatusLabel("QUESTIONABLE")).toBe("Q");
    expect(espnStatusLabel("DOUBTFUL")).toBe("D");
    expect(espnStatusLabel("OUT")).toBe("OUT");
    expect(espnStatusLabel("INJURY_RESERVE")).toBe("IR");
    expect(espnStatusLabel("DAY_TO_DAY")).toBe("DTD");
    expect(espnStatusLabel("ACTIVE")).toBeNull();
    expect(espnStatusLabel("NORMAL")).toBeNull();
    expect(espnStatusLabel(null)).toBeNull();
  });

  it("names the snapshot time, or says there is none before kickoff", () => {
    expect(asOfCaption(null, null)).toBe("no snapshot before kickoff");
    expect(asOfCaption("QUESTIONABLE", "2026-10-11T12:00:00Z")).toBe("Q as of Sun 08:00");
    expect(asOfCaption("ACTIVE", "2026-10-11T12:00:00Z")).toBe("Healthy as of Sun 08:00");
  });

  it("practice days skip missing values", () => {
    expect(practiceLine("Limit", "Full", "DNP")).toBe("Limit, Full, DNP");
    expect(practiceLine("Limit", null, "Full")).toBe("Limit, Full");
    expect(practiceLine(null, null, null)).toBeNull();
  });

  it("FantasyPros timing only claims before kickoff when the update date proves it", () => {
    expect(fpTiming(true)).toBe("reported before kickoff");
    expect(fpTiming(false)).toBe("updated after kickoff");
    expect(fpTiming(null)).toBe("no update time on the report");
  });
});

describe("slot label", () => {
  it("names the ESPN flex eligibility string as the slot, and leaves a real position alone", () => {
    expect(slotLabel("RB/WR/TE")).toBe("FLEX");
    expect(slotLabel("WR")).toBe("WR");
    expect(slotLabel("D/ST")).toBe("D/ST");
    expect(slotLabel("BE")).toBe("BE");
  });
});

describe("starter misses", () => {
  const row = (over: Partial<StarterRow>): StarterRow => ({
    espn_team_id: 1,
    team: "A",
    player: "P",
    position: "WR",
    nfl_team: "KC",
    slot: "WR",
    proj_pts: 15,
    actual_pts: 2,
    kickoff: "2026-10-04T17:00:00Z",
    snapshot_status: null,
    snapshot_pulled_at: null,
    fp_matched: false,
    fp_status: null,
    practice_1: null,
    practice_2: null,
    practice_3: null,
    probability_of_playing: null,
    injury_update_date: null,
    known_before_kickoff: null,
    fp_fetched_at: null,
    fp_points: null,
    ...over,
  });

  it("keeps starters at least the threshold under projection, worst first, and skips bench and IR", () => {
    const rows = [
      row({ player: "Small", proj_pts: 10, actual_pts: 5 }),
      row({ player: "Big", proj_pts: 20, actual_pts: 0 }),
      row({ player: "Bench", slot: "BE", proj_pts: 30, actual_pts: 0 }),
      row({ player: "Hurt", slot: "IR", proj_pts: 30, actual_pts: 0 }),
      row({ player: "Edge", proj_pts: 10 + MISS_POINTS, actual_pts: 10 }),
    ];
    expect(starterMisses(rows).map((r) => r.player)).toEqual(["Big", "Edge"]);
  });

  it("ignores rows with no projection or no actual", () => {
    expect(starterMisses([row({ proj_pts: null }), row({ actual_pts: null })])).toEqual([]);
  });
});

describe("week grid and PA", () => {
  const rows = [
    tw({ week: 1, espn_team_id: 1, team: "A", own_pm: 10, cum_pa: 90 }),
    tw({ week: 2, espn_team_id: 1, team: "A", own_pm: -4, cum_pa: 200 }),
    tw({ week: 1, espn_team_id: 2, team: "B", own_pm: -10, cum_pa: 110 }),
    tw({ week: 2, espn_team_id: 2, team: "B", own_pm: 3, cum_pa: 150, is_final: false }),
  ];

  it("pivots team-weeks into one row per team with a cell per week", () => {
    const g = buildWeekGrid(rows);
    expect(g.weeks).toEqual([1, 2]);
    expect(g.teams.map((t) => t.team)).toEqual(["A", "B"]);
    expect(g.teams[0]!.cells.get(2)?.own_pm).toBe(-4);
    expect(g.teams[1]!.cells.get(2)?.is_final).toBe(false);
  });

  it("ranks points against with the toughest schedule first, using the last week's running total", () => {
    const pa = paRanking(rows);
    expect(pa.map((r) => [r.team, r.cum_pa])).toEqual([
      ["A", 200],
      ["B", 150],
    ]);
  });
});

describe("transactions", () => {
  const t = (over: Partial<TxnRow>): TxnRow => ({
    id: 1,
    week: 1,
    espn_ts: "2026-09-08T00:01:22Z",
    espn_team_id: 1,
    team: "A",
    txn_type: "WAIVER",
    status: "EXECUTED",
    bid: 5,
    item_type: "ADD",
    player: "X",
    group_key: "g1",
    ...over,
  });

  it("groups items of one transaction and sorts newest first", () => {
    const groups = groupTransactions([
      t({ id: 1, item_type: "ADD", player: "X", group_key: "g1" }),
      t({ id: 2, item_type: "DROP", player: "Y", group_key: "g1" }),
      t({ id: 3, group_key: "g2", espn_ts: "2026-09-09T00:00:00Z", status: "FAILED_ROSTERLIMIT" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["g2", "g1"]);
    expect(groups[1]!.items.map((i) => i.player)).toEqual(["X", "Y"]);
    expect(groups[0]!.status).toBe("FAILED_ROSTERLIMIT");
    expect(groups[0]!.bid).toBe(5);
  });

  it("puts undated groups after dated ones", () => {
    const groups = groupTransactions([
      t({ id: 1, group_key: "undated", espn_ts: null }),
      t({ id: 2, group_key: "dated" }),
    ]);
    expect(groups.map((g) => g.key)).toEqual(["dated", "undated"]);
  });
});

describe("transaction weeks", () => {
  const g = (over: Partial<TxnGroup>): TxnGroup => ({
    key: "k",
    ts: null,
    week: 1,
    teams: ["A"],
    teamIds: [1],
    txn_type: "WAIVER",
    status: "EXECUTED",
    bid: null,
    items: [],
    ...over,
  });

  it("keeps every week, splits the draft and undated trades, and opens the latest week", () => {
    const tabs = transactionWeekTabs(
      [
        g({ key: "w1", week: 1 }),
        g({ key: "d", week: 0, txn_type: "DRAFT" }),
        g({ key: "tr", week: null, txn_type: "TRADE" }),
      ],
      [1, 2, 4],
    );
    expect(tabs.map((t) => t.label)).toEqual(["Draft", "Week 1", "Week 2", "Week 4", "Trades"]);
    expect(tabs.find((t) => t.key === "2")!.groups).toEqual([]);
    expect(defaultTxnWeek(tabs)).toBe("4");
  });
});

describe("transaction filters and lines", () => {
  const t = (over: Partial<TxnRow>): TxnRow => ({
    id: 1,
    week: 1,
    espn_ts: "2026-09-08T00:01:22Z",
    espn_team_id: 1,
    team: "A",
    txn_type: "WAIVER",
    status: "EXECUTED",
    bid: 5,
    item_type: "ADD",
    player: "X",
    group_key: "g1",
    ...over,
  });
  const rows = [
    t({ id: 1, group_key: "w", espn_team_id: 1, team: "A" }),
    t({ id: 2, group_key: "tr", espn_team_id: 1, team: "A", txn_type: "TRADE", item_type: "TRADE_SENT", player: "S" }),
    t({ id: 3, group_key: "tr", espn_team_id: 2, team: "B", txn_type: "TRADE", item_type: "TRADE_RECEIVED", player: "S" }),
    t({ id: 4, group_key: "fa", espn_team_id: 3, team: "C", txn_type: "FREEAGENT" }),
  ];

  it("filters by team without splitting a trade across its two sides", () => {
    const out = filterTransactions(rows, { team: 2, type: null });
    expect(out.map((r) => r.id)).toEqual([2, 3]);
  });

  it("filters by type and by both", () => {
    expect(filterTransactions(rows, { team: null, type: "FREEAGENT" }).map((r) => r.id)).toEqual([4]);
    expect(filterTransactions(rows, { team: 1, type: "WAIVER" }).map((r) => r.id)).toEqual([1]);
    expect(filterTransactions(rows, { team: null, type: null })).toHaveLength(4);
  });

  it("describes each item and lists a trade once, on the receiving side", () => {
    const [trade] = groupTransactions(rows.filter((r) => r.group_key === "tr"));
    expect(txnItemLines(trade!)).toEqual(["B gets S"]);
    const [w] = groupTransactions([
      t({ id: 1, item_type: "ADD", player: "X" }),
      t({ id: 2, item_type: "DROP", player: "Y" }),
    ]);
    expect(txnItemLines(w!)).toEqual(["Add X", "Drop Y"]);
  });
});

describe("paceShareGap", () => {
  it("uses NFL games played against the full-season projection", () => {
    const cousins = paceShareGap(116.8, 112.64, 4, 14);
    const wright = paceShareGap(1.7, 104.91, 3, 14);
    const bust = paceShareGap(2.1, 104.91, 4, 14);
    expect(cousins).toBeCloseTo(75.12, 1);
    expect(wright).toBeCloseTo(-19.81, 1);
    expect(bust).toBeCloseTo(-26.57, 1);
    expect(shareTone(cousins)).toEqual({ dir: "pos", level: "high" });
    expect(shareTone(wright).level).toBe("mid");
    expect(shareTone(bust).level).toBe("high");
    expect(paceShareGap(116.8, 112.64, 0, 14)).toBeNull();
  });
});

describe("acquirePaceSort", () => {
  it("sorts a player behind pace before one ahead, and a missing projection last", () => {
    const behind = acquirePaceSort(40, 200, 4, 14);
    const ahead = acquirePaceSort(124.5, 352.5, 4, 14);
    const missing = acquirePaceSort(10, null, 4, 14);
    expect(behind).toBeLessThan(0);
    expect(ahead).toBeGreaterThan(0);
    expect(behind).toBeLessThan(ahead);
    expect(missing).toBe(Number.POSITIVE_INFINITY);
  });

  it("keeps a zero gap as zero", () => {
    expect(acquirePaceSort(50, 100, 7, 14)).toBe(0);
  });
});

describe("rosPprRank", () => {
  const rodgers = { ECR: { STD: { QB: 19 }, PPR: { QB: 19 }, "ROS-PPR": { QB: 29, DST: 8 } } };

  it("reads the rest-of-season PPR integer at the player's position", () => {
    expect(rosPprRank(rodgers, "QB")).toBe(29);
    expect(rosPprRank(rodgers, "qb")).toBe(29);
  });

  it("maps a defense slot onto DST", () => {
    expect(rosPprRank(rodgers, "D/ST")).toBe(8);
    expect(rosPprRank(rodgers, "DST")).toBe(8);
  });

  it("is null when the key is missing or the value is not an integer", () => {
    expect(rosPprRank(rodgers, "RB")).toBeNull();
    expect(rosPprRank({ ECR: { "ROS-PPR": { QB: 19.5 } } }, "QB")).toBeNull();
    expect(rosPprRank({ ECR: { PPR: { QB: 19 } } }, "QB")).toBeNull();
    expect(rosPprRank(null, "QB")).toBeNull();
    expect(rosPprRank(rodgers, null)).toBeNull();
  });
});

describe("week matchups", () => {
  it("pairs the two sides of each matchup once, lowest team id first", () => {
    const rows = [
      tw({ espn_team_id: 2, team: "B", opp_espn_team_id: 1, opp_team: "A" }),
      tw({ espn_team_id: 1, team: "A", opp_espn_team_id: 2, opp_team: "B" }),
      tw({ espn_team_id: 3, team: "C", opp_espn_team_id: 4, opp_team: "D" }),
      tw({ espn_team_id: 4, team: "D", opp_espn_team_id: 3, opp_team: "C" }),
    ];
    const m = weekMatchups(rows);
    expect(m.map((x) => [x.a.team, x.b.team])).toEqual([["A", "B"], ["C", "D"]]);
  });

  it("drops a side whose opponent row is missing instead of inventing one", () => {
    expect(weekMatchups([tw({ espn_team_id: 1, opp_espn_team_id: 2 })])).toEqual([]);
  });
});

describe("pace", () => {
  it("is season points minus projection times weeks done over the season length", () => {
    // 352.5 * 4 / 14 = 100.714; 124.5 is 23.786 ahead.
    expect(paceGap(124.5, 352.5, 4, 14)).toBeCloseTo(23.7857, 3);
    expect(weeksLeft(4, 14)).toBe(10);
    expect(pointsRemaining(124.5, 352.5)).toBeCloseTo(228, 1);
  });

  it("stays blank with no projection or no completed week", () => {
    expect(paceGap(10, null, 4, 14)).toBeNull();
    expect(paceGap(10, 0, 4, 14)).toBeNull();
    expect(paceGap(10, 100, 0, 14)).toBeNull();
    expect(weeksLeft(0, 14)).toBe(14);
    expect(weeksLeft(4, 0)).toBeNull();
  });
});

function add(over: Partial<AvailablePlayer>): AvailablePlayer {
  return {
    espn_player_id: 1,
    player: "Add",
    position: "RB",
    nfl_team: "KC",
    injury_status: "ACTIVE",
    availability: "WAIVERS",
    percent_owned: 10,
    on_bye: false,
    waiver_at: null,
    week: 4,
    pulled_at: "2026-10-05T00:00:00Z",
    player_id: "gsis-1",
    ppr: 12,
    dk: 11,
    ...over,
  };
}

function starter(over: Partial<StarterProj>): StarterProj {
  return { player: "Starter", position: "RB", slot: "RB", nfl_team: "PHI", ppr: 9, ...over };
}

describe("waiver suggestions", () => {
  it("beats the worst starter at the position and orders by the PPR gap", () => {
    const suggestions = waiverSuggestions(
      [add({ player: "A", ppr: 12, espn_player_id: 1 }), add({ player: "B", ppr: 20, espn_player_id: 2, player_id: "gsis-2" })],
      [starter({ player: "Good", ppr: 15 }), starter({ player: "Bad", ppr: 9 })],
    );
    expect(suggestions.map((s) => [s.add.player, s.replace.player, s.gap])).toEqual([
      ["B", "Bad", 11],
      ["A", "Bad", 3],
    ]);
  });

  it("uses the flex starter when that starter is lower and the player is RB, WR, or TE", () => {
    const [s] = waiverSuggestions(
      [add({ position: "WR", ppr: 10 })],
      [starter({ slot: "WR", player: "WR1", ppr: 11 }), starter({ slot: "RB/WR/TE", player: "Flex", ppr: 8 })],
    );
    expect(s?.replace.player).toBe("Flex");
    expect(s?.gap).toBe(2);
  });

  it("does not use the flex for a kicker", () => {
    expect(
      waiverSuggestions(
        [add({ position: "K", ppr: 10 })],
        [starter({ slot: "K", player: "K", ppr: 12 }), starter({ slot: "RB/WR/TE", player: "Flex", ppr: 1 })],
      ),
    ).toEqual([]);
  });

  it("skips OUT, IR, bye, a tie, and a player with no unique sim row", () => {
    const starters = [starter({ ppr: 9 })];
    expect(waiverSuggestions([add({ injury_status: "OUT", ppr: 20 })], starters)).toEqual([]);
    expect(waiverSuggestions([add({ injury_status: "INJURY_RESERVE", ppr: 20 })], starters)).toEqual([]);
    expect(waiverSuggestions([add({ on_bye: true, ppr: 20 })], starters)).toEqual([]);
    expect(waiverSuggestions([add({ ppr: 9 })], starters)).toEqual([]);
    expect(waiverSuggestions([add({ player_id: null, ppr: 20 })], starters)).toEqual([]);
    expect(waiverSuggestions([add({ ppr: null })], starters)).toEqual([]);
  });

  it("does not use a slot whose starter has no projection", () => {
    expect(waiverSuggestions([add({ ppr: 20 })], [starter({ ppr: null })])).toEqual([]);
  });

  it("sorts our PPR descending and leaves unmatched players last", () => {
    const rows = sortAvailable([
      add({ player: "Zed", ppr: null }),
      add({ player: "Low", ppr: 4 }),
      add({ player: "High", ppr: 9 }),
    ]);
    expect(rows.map((r) => r.player)).toEqual(["High", "Low", "Zed"]);
  });

  it("names a waiver hold and a free agent, and says both when the status is blank", () => {
    expect(availabilityLabel("WAIVERS")).toBe("Waivers");
    expect(availabilityLabel("FREEAGENT")).toBe("Free agent");
    expect(availabilityLabel("")).toBe("Waivers and free agents");
  });
});

describe("season share", () => {
  it("is season points as a percent of season projection", () => {
    expect(seasonShare(50, 200)).toBe(25);
    expect(seasonShare(0, 10)).toBe(0);
  });

  it("is blank when projection is missing or zero", () => {
    expect(seasonShare(10, null)).toBeNull();
    expect(seasonShare(null, 10)).toBeNull();
    expect(seasonShare(10, 0)).toBeNull();
  });
});

describe("transaction summary", () => {
  const t = (over: Partial<TxnRow>): TxnRow => ({
    id: 1,
    week: 1,
    espn_ts: "2026-09-08T00:01:22Z",
    espn_team_id: 1,
    team: "A",
    txn_type: "WAIVER",
    status: "EXECUTED",
    bid: 25,
    item_type: "ADD",
    player: "X",
    group_key: "g1",
    ...over,
  });

  it("counts a waiver add and drop as one claim and one bid", () => {
    const [a] = txnSummary([
      t({ id: 1, item_type: "ADD", player: "X", bid: 25 }),
      t({ id: 2, item_type: "DROP", player: "Y", bid: 25 }),
    ]);
    expect(a).toMatchObject({ team: "A", waivers: 1, faab: 25, added: 1, dropped: 1, failed: 0 });
  });

  it("keeps failed and pending bids out of FAAB spent", () => {
    const [a] = txnSummary([
      t({ group_key: "won", status: "EXECUTED", bid: 10 }),
      t({ id: 2, group_key: "lost", status: "FAILED_ROSTERLIMIT", bid: 50, item_type: "ADD" }),
      t({ id: 3, group_key: "wait", status: "PENDING", bid: 5, item_type: "ADD" }),
    ]);
    expect(a).toMatchObject({ waivers: 1, faab: 10, failed: 1, pending: 1, added: 1 });
  });

  it("counts a trade once per side and skips the draft", () => {
    const rows = txnSummary([
      t({ group_key: "tr", espn_team_id: 1, team: "A", txn_type: "TRADE", item_type: "TRADE_SENT", player: "S", bid: null }),
      t({ id: 2, group_key: "tr", espn_team_id: 2, team: "B", txn_type: "TRADE", item_type: "TRADE_RECEIVED", player: "S", bid: null }),
      t({ id: 3, group_key: "d", txn_type: "DRAFT", item_type: "DRAFTED", player: "P", bid: null }),
      t({ id: 4, group_key: "fa", espn_team_id: 1, team: "A", txn_type: "FREEAGENT", item_type: "ADD", player: "F", bid: null }),
    ]);
    const a = rows.find((r) => r.team === "A")!;
    const b = rows.find((r) => r.team === "B")!;
    expect(a).toMatchObject({ trades: 1, dropped: 1, freeAgents: 1, added: 1, waivers: 0 });
    expect(b).toMatchObject({ trades: 1, added: 1, dropped: 0 });
    expect(rows.some((r) => r.added > 0 && r.team !== "A" && r.team !== "B")).toBe(false);
  });
});
