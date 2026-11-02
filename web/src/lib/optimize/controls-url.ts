import { asPointSource } from "./points";
import {
  DEFAULT_CLASSIC,
  DEFAULT_FLEX,
  DEFAULT_SHOWDOWN,
  type ConstructionId,
  type FlexEligible,
  type GameScriptKind,
  type GameStance,
  type ShowdownScriptKind,
  type SolveControls,
} from "./types";

export const CONTROL_PARAMS = [
  "construction",
  "pts",
  "lineups",
  "cap",
  "minSalary",
  "maxExp",
  "maxTeam",
  "rand",
  "stackN",
  "bringBack",
  "noQbDst",
  "flexRB",
  "flexWR",
  "flexTE",
  "reqStack",
  "scripts",
  "sdScript",
] as const;

const GAME_SCRIPTS = new Set<GameScriptKind>(["shootout", "control", "grind", "fade"]);
const SHOWDOWN_SCRIPTS = new Set<ShowdownScriptKind>([
  "shootout",
  "home_control",
  "away_control",
  "defensive",
]);

export function parseGameScripts(raw: string | null): GameStance[] {
  if (!raw) return [];
  const out: GameStance[] = [];
  for (const part of raw.split(",")) {
    const [gameId, script, team] = part.trim().split(":");
    if (!gameId || !script || !GAME_SCRIPTS.has(script as GameScriptKind)) continue;
    out.push({
      gameId,
      script: script as GameScriptKind,
      ...(team ? { team } : {}),
    });
  }
  return out;
}

export function formatGameScripts(stances: GameStance[] | undefined): string {
  if (!stances?.length) return "";
  return stances
    .map((s) => (s.team ? `${s.gameId}:${s.script}:${s.team}` : `${s.gameId}:${s.script}`))
    .join(",");
}

function asShowdownScript(raw: string | null): ShowdownScriptKind | null {
  if (raw && SHOWDOWN_SCRIPTS.has(raw as ShowdownScriptKind)) return raw as ShowdownScriptKind;
  return null;
}

function asConstruction(raw: string | null, fallback: ConstructionId): ConstructionId {
  if (raw === "cash" || raw === "single" || raw === "mass") return raw;
  return fallback;
}

export function classicBaseline(): SolveControls {
  return { ...DEFAULT_CLASSIC, lineups: 5, flexEligible: { ...DEFAULT_FLEX } };
}

function num(raw: string | null, fallback: number): number {
  if (raw == null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function flag(raw: string | null, fallback: boolean): boolean {
  if (raw == null) return fallback;
  return raw !== "0" && raw !== "false";
}

export function parseSolveControls(sp: URLSearchParams, showdown: boolean): SolveControls {
  const base = showdown ? { ...DEFAULT_SHOWDOWN } : classicBaseline();
  const gameScripts = parseGameScripts(sp.get("scripts"));
  const showdownScript = asShowdownScript(sp.get("sdScript"));
  return {
    ...base,
    construction: asConstruction(sp.get("construction"), base.construction),
    points: asPointSource(sp.get("pts")),
    minPlayerDiff: num(sp.get("minDiff"), base.minPlayerDiff),
    lineups: num(sp.get("lineups"), base.lineups),
    salaryCap: num(sp.get("cap"), base.salaryCap),
    minSalary: num(sp.get("minSalary"), base.minSalary),
    maxExposure: num(sp.get("maxExp"), base.maxExposure),
    maxPerTeam: num(sp.get("maxTeam"), base.maxPerTeam),
    randomness: num(sp.get("rand"), base.randomness),
    stackN: num(sp.get("stackN"), base.stackN),
    bringBack: num(sp.get("bringBack"), base.bringBack),
    noQbVsDst: flag(sp.get("noQbDst"), base.noQbVsDst),
    flexEligible: {
      RB: flag(sp.get("flexRB"), true),
      WR: flag(sp.get("flexWR"), true),
      TE: flag(sp.get("flexTE"), true),
    },
    requireStack: flag(sp.get("reqStack"), base.requireStack),
    ...(gameScripts.length ? { gameScripts } : {}),
    ...(showdownScript ? { showdownScript } : {}),
  };
}

export function applySolveControls(
  controls: SolveControls,
  base: URLSearchParams,
  showdown: boolean,
): URLSearchParams {
  const p = new URLSearchParams(base.toString());
  const def = showdown ? DEFAULT_SHOWDOWN : classicBaseline();
  const setOrDel = (key: string, value: string, sameAsDefault: boolean) => {
    if (sameAsDefault) p.delete(key);
    else p.set(key, value);
  };
  setOrDel("construction", controls.construction, controls.construction === def.construction);
  setOrDel("pts", controls.points, controls.points === def.points);
  setOrDel("minDiff", String(controls.minPlayerDiff), controls.minPlayerDiff === def.minPlayerDiff);
  setOrDel("lineups", String(controls.lineups), controls.lineups === def.lineups);
  setOrDel("cap", String(controls.salaryCap), controls.salaryCap === def.salaryCap);
  setOrDel("minSalary", String(controls.minSalary), controls.minSalary === def.minSalary);
  setOrDel("maxExp", String(controls.maxExposure), controls.maxExposure === def.maxExposure);
  setOrDel("maxTeam", String(controls.maxPerTeam), controls.maxPerTeam === def.maxPerTeam);
  setOrDel("rand", String(controls.randomness), controls.randomness === def.randomness);
  setOrDel("stackN", String(controls.stackN), controls.stackN === def.stackN);
  setOrDel("bringBack", String(controls.bringBack), controls.bringBack === def.bringBack);
  setOrDel("noQbDst", controls.noQbVsDst ? "1" : "0", controls.noQbVsDst === def.noQbVsDst);
  const flex: FlexEligible = controls.flexEligible ?? DEFAULT_FLEX;
  setOrDel("flexRB", flex.RB ? "1" : "0", flex.RB);
  setOrDel("flexWR", flex.WR ? "1" : "0", flex.WR);
  setOrDel("flexTE", flex.TE ? "1" : "0", flex.TE);
  setOrDel("reqStack", controls.requireStack ? "1" : "0", controls.requireStack === def.requireStack);
  const scriptsStr = formatGameScripts(controls.gameScripts);
  setOrDel("scripts", scriptsStr, scriptsStr === "");
  setOrDel("sdScript", controls.showdownScript ?? "", !controls.showdownScript);
  return p;
}
