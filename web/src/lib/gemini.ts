import { sql } from "@/lib/db";
import { hasSnakeIdentifier, numeralsAllowed } from "@/lib/numerals";

export class GeminiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiError";
  }
}

export type GenerateJsonArgs = {
  phase: string;
  runId?: string | null;
  refId?: string | null;
  schema: Record<string, unknown>;
  system: string;
  user: string;
  payload?: unknown;
};

/** Phase 1 is cost-sensitive and latency-visible. Phases 2/3 write toward a prior. */
const PHASE_MODEL: Record<string, string> = {
  explain: "gemini-3.5-flash-lite",
  claims: "gemini-3.8-flash",
  "optimize-nl": "gemini-3.8-flash",
};

export function geminiModel(phase: string): string {
  return PHASE_MODEL[phase] ?? PHASE_MODEL.claims;
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === "object") return Object.values(value).flatMap(collectStrings);
  return [];
}

function apiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new GeminiError("Gemini is not configured on the server");
  return key;
}

async function logCall(args: {
  phase: string;
  runId?: string | null;
  refId?: string | null;
  model: string;
  input: unknown;
  output: unknown;
}): Promise<number | null> {
  const rows = await sql()`
    insert into model.llm_calls (phase, run_id, ref_id, model, input, output)
    values (
      ${args.phase},
      ${args.runId ?? null}::uuid,
      ${args.refId ?? null},
      ${args.model},
      ${JSON.stringify(args.input)}::jsonb,
      ${JSON.stringify(args.output)}::jsonb
    )
    returning id`;
  const id = rows[0]?.id;
  return typeof id === "number" ? id : id != null ? Number(id) : null;
}

export async function cachedExplain(runId: string, gameId: string): Promise<unknown | null> {
  const rows = await sql()`
    select
      case
        when jsonb_typeof(output) = 'string' then (output #>> '{}')::jsonb
        else output
      end as output
    from model.llm_calls
    where phase = 'explain' and run_id = ${runId}::uuid and ref_id = ${gameId}
      and (
        (output ? 'driver' and output ? 'evidence_strength' and output ? 'sentences')
        or (
          jsonb_typeof(output) = 'string'
          and (output #>> '{}')::jsonb ? 'driver'
          and (output #>> '{}')::jsonb ? 'evidence_strength'
          and (output #>> '{}')::jsonb ? 'sentences'
        )
      )
    order by created_at desc limit 1`;
  return rows[0]?.output ?? null;
}

export async function generateJson(args: GenerateJsonArgs): Promise<{
  data: unknown;
  callId: number | null;
}> {
  const model = geminiModel(args.phase);
  const key = apiKey();
  const input = { system: args.system, user: args.user, schema: args.schema, payload: args.payload ?? null };
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: args.system }] },
      contents: [{ role: "user", parts: [{ text: args.user }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseJsonSchema: args.schema,
      },
    }),
  });
  if (res.status === 429) {
    await logCall({ phase: args.phase, runId: args.runId, refId: args.refId, model, input, output: { error: "429" } });
    throw new GeminiError("Gemini rate limit hit; try again later");
  }
  if (!res.ok) {
    await logCall({
      phase: args.phase,
      runId: args.runId,
      refId: args.refId,
      model,
      input,
      output: { error: res.status },
    });
    throw new GeminiError("Gemini request failed");
  }
  const body = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    await logCall({ phase: args.phase, runId: args.runId, refId: args.refId, model, input, output: body });
    throw new GeminiError("Gemini returned no JSON");
  }
  let data: unknown;
  try {
    data = JSON.parse(text) as unknown;
  } catch {
    await logCall({ phase: args.phase, runId: args.runId, refId: args.refId, model, input, output: { text } });
    throw new GeminiError("Gemini returned invalid JSON");
  }
  if (args.payload != null && typeof data === "object" && data && "sentences" in data) {
    const prose = collectStrings(data).join(" ");
    if (args.phase === "explain" && hasSnakeIdentifier(prose)) {
      await logCall({
        phase: args.phase,
        runId: args.runId,
        refId: args.refId,
        model,
        input,
        output: { data, rejected: "snake" },
      });
      throw new GeminiError("Explanation used a field name");
    }
    const check = numeralsAllowed(prose, args.payload);
    if (!check.ok) {
      await logCall({
        phase: args.phase,
        runId: args.runId,
        refId: args.refId,
        model,
        input,
        output: { data, rejected: check.bad },
      });
      throw new GeminiError("Explanation used a number that is not in the payload");
    }
  }
  const callId = await logCall({
    phase: args.phase,
    runId: args.runId,
    refId: args.refId,
    model,
    input,
    output: data,
  });
  return { data, callId };
}
