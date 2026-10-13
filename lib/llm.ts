import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI, ApiError as GeminiApiError, type ThinkingLevel } from '@google/genai';
import { optionalEnv, requireEnv } from './env';

// One structured-output call: Anthropic primary, Gemini (free tier) as automatic backup. Every model
// call in RailCite has the same shape — a system prompt, one user message, and a single forced
// "tool" whose JSON input IS the result — so the providers differ only in transport.
//
// Fallback fires ONLY when Anthropic itself rejects the call (LlmUnavailableError: dead key,
// exhausted credits, rate limit, overload, outage) AND GEMINI_API_KEY is set. A malformed or
// truncated reply is NOT a provider failure — callers own that (synthesize retries once). Every
// fallback is logged with the Anthropic status, so a dead key shows up in logs instead of hiding
// behind a working backup.

export interface ToolSpec {
  name: string;
  description: string;
  input_schema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

/** smart = synthesis/translation; fast = the per-query domain classifier. */
export type ModelTier = 'smart' | 'fast';

const MODELS = {
  anthropic: { smart: 'claude-sonnet-5', fast: 'claude-haiku-4-5-20251001' },
  // Both on the Gemini API free tier (ai.google.dev/gemini-api/docs/pricing, checked 2026-10-13).
  gemini: { smart: 'gemini-3.8-flash', fast: 'gemini-3.5-flash-lite' },
} as const;

/**
 * The provider itself rejected the call (bad key, quota/rate limit, overload, outage). Routes map
 * this to 503 "answers temporarily unavailable"; `status` is kept so logs show WHICH (a 401 is a
 * dead key, not a blip).
 */
export class LlmUnavailableError extends Error {
  constructor(readonly provider: string, readonly status: number | undefined, readonly cause: unknown) {
    super(`${provider} API error${status ? ` (${status})` : ''}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'LlmUnavailableError';
  }
}

export interface ToolCallResult {
  /** The tool's JSON input, or undefined when the model returned no/malformed output. */
  input: unknown;
  /** The reply hit the output ceiling — callers fail loud on it (see synthesize.ts). */
  truncated: boolean;
}

export async function callTool(opts: {
  tier: ModelTier; system: string; user: string; tool: ToolSpec; maxTokens: number;
  /** Test seam for the Anthropic path only. */
  anthropic?: Anthropic;
}): Promise<ToolCallResult> {
  try {
    return await callAnthropic(opts);
  } catch (e) {
    if (!(e instanceof LlmUnavailableError) || !optionalEnv('GEMINI_API_KEY', '')) throw e;
    console.warn(`llm: anthropic unavailable (status ${e.status ?? 'n/a'}) — falling back to gemini:`, e.message);
    return callGemini(opts);
  }
}

async function callAnthropic({ tier, system, user, tool, maxTokens, anthropic }: Parameters<typeof callTool>[0]) {
  const client = anthropic ?? new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') });
  let msg;
  try {
    msg = await client.messages.create({
      // claude-sonnet-5 family removed sampling params — sending temperature 400s. Do not add it.
      model: MODELS.anthropic[tier], max_tokens: maxTokens,
      system,
      tools: [tool], tool_choice: { type: 'tool', name: tool.name },
      messages: [{ role: 'user', content: user }],
    });
  } catch (e) {
    if (e instanceof Anthropic.APIError) throw new LlmUnavailableError('anthropic', e.status, e);
    throw e;
  }
  const tu = msg.content.find(b => b.type === 'tool_use' && b.name === tool.name);
  return { input: tu && tu.type === 'tool_use' ? tu.input : undefined, truncated: msg.stop_reason === 'max_tokens' };
}

async function callGemini({ tier, system, user, tool, maxTokens }: Parameters<typeof callTool>[0]) {
  const ai = new GoogleGenAI({ apiKey: requireEnv('GEMINI_API_KEY') });
  let res;
  try {
    res = await ai.models.generateContent({
      model: MODELS.gemini[tier],
      contents: user,
      config: {
        systemInstruction: system,
        // JSON mode constrained to the tool's schema = the same contract as Anthropic's forced tool.
        responseMimeType: 'application/json',
        responseJsonSchema: tool.input_schema,
        // Gemini counts thinking tokens against maxOutputTokens. These tasks are extractive /
        // routing, not reasoning-heavy — keep thinking LOW so it can't eat the answer's budget
        // (truncation is this app's recurring failure; see synthesize.ts).
        thinkingConfig: { thinkingLevel: 'LOW' as ThinkingLevel },
        maxOutputTokens: maxTokens,
      },
    });
  } catch (e) {
    if (e instanceof GeminiApiError) throw new LlmUnavailableError('gemini', e.status, e);
    throw e;
  }
  let input: unknown;
  try { input = JSON.parse(res.text ?? ''); } catch { input = undefined; }
  return { input, truncated: res.candidates?.[0]?.finishReason === 'MAX_TOKENS' };
}
