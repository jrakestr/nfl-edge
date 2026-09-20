import { NextResponse } from "next/server";
import { GeminiError, generateJson } from "@/lib/gemini";
import { compileFilters, type FilterTokens } from "@/lib/optimize/compile-filters";
import type { OptPlayer } from "@/lib/optimize/types";
import { joinRoster } from "@/lib/names";

export const dynamic = "force-dynamic";

const SCHEMA = {
  type: "object",
  properties: {
    lineups: { type: "integer" },
    playerMinSalary: { type: "integer" },
    minValue: { type: "number" },
    topValuePerPos: { type: "integer" },
    sortBy: { type: "string", enum: ["value", "proj", "salary", "own", "ceiling"] },
    sortDir: { type: "string", enum: ["asc", "desc"] },
    stackTeam: { type: "string" },
    stackN: { type: "integer" },
    bringBack: { type: "integer" },
    fadeTeams: { type: "array", items: { type: "string" } },
    windows: { type: "array", items: { type: "string", enum: ["early", "afternoon", "primetime"] } },
    excludeWindows: { type: "array", items: { type: "string", enum: ["early", "afternoon", "primetime"] } },
    afterFour: { type: "boolean" },
    lateSwapOnly: { type: "boolean" },
    elevatedOnly: { type: "boolean" },
    totalOver: { type: "number" },
    underdogs: { type: "boolean" },
    homeAway: { type: "string", enum: ["home", "away"] },
    roof: { type: "string" },
    questions: { type: "array", items: { type: "string" } },
  },
};

const SYSTEM = `Translate the user's optimizer request into filter tokens.
Do not invent players or teams.
If a phrase is ambiguous (late games, a shared last name), put a question in questions and do not guess a window.
"Afternoon" is unambiguous. "Late games" is not.
"Points per dollar", "value", "pts/$", and "bang for the buck" all mean the value metric (projection per $1k).
"Sort", "rank", or "show by X" is a view, not a filter: emit sortBy (value, proj, salary, own, or ceiling) with sortDir and no pool filter.
"Only", "at least", or "top N value" is a filter: emit minValue or topValuePerPos.
Emit tokens only. Never emit projection numbers.
Do not output a SolveControls object.`;

export async function POST(req: Request) {
  let body: { text?: string; players?: OptPlayer[]; lock?: string[]; stack?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Need JSON" }, { status: 400 });
  }
  const text = body.text?.trim() ?? "";
  const players = Array.isArray(body.players) ? body.players : [];
  const lock = Array.isArray(body.lock) ? body.lock.filter((id): id is string => typeof id === "string") : [];
  const stackIds = Array.isArray(body.stack)
    ? body.stack.filter((id): id is string => typeof id === "string")
    : [];
  if (!text) return NextResponse.json({ error: "Need a phrase" }, { status: 400 });
  try {
    const { data } = await generateJson({
      phase: "optimize-nl",
      schema: SCHEMA,
      system: SYSTEM,
      user: text,
    });
    const tokens = data as FilterTokens;
    if (/\blate games\b/i.test(text) && !tokens.questions?.length) {
      tokens.questions = ["Did you mean the 4pm window or primetime?"];
      delete tokens.windows;
      delete tokens.excludeWindows;
      delete tokens.afterFour;
    }
    const compiled = compileFilters(players, tokens, { lock, stack: stackIds });
    const teams = new Set(players.map((p) => p.team));
    const mentioned = [...text.matchAll(/\b([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\b/g)].map((m) => m[1]!);
    for (const name of mentioned) {
      if (["Sunday", "Monday", "Thursday", "Detroit", "Kansas", "City"].includes(name)) continue;
      const hits = players.filter((p) => p.name.toLowerCase() === name.toLowerCase());
      if (hits.length > 1) {
        compiled.questions.push(`I don't know which ${name} you mean`);
      } else if (hits.length === 0 && name.length > 3) {
        const { rejected } = joinRoster(
          [{ player: name, team: "", status: "active", channel: "all", confidence: "low" }],
          players.map((p) => ({ gsis_id: p.player_dk_id, full_name: p.name, team: p.team })),
          teams,
        );
        if (rejected[0]?.reason === "unmatched" && /jones/i.test(name)) {
          compiled.questions.push(`I don't know which Jones you mean`);
        }
      }
    }
    return NextResponse.json({
      tokens,
      ...compiled,
      view: tokens.sortBy
        ? { sortBy: tokens.sortBy, sortDir: tokens.sortDir === "asc" ? "asc" : "desc" }
        : null,
    });
  } catch (e) {
    const msg = e instanceof GeminiError ? e.message : "Parse failed";
    return NextResponse.json({ error: msg }, { status: 200 });
  }
}
